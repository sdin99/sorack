// Thin wrapper around isomorphic-git so the rest of the api can talk to
// the local runbooks repo without leaking the verbose options object
// every call. All operations are async and throw on failure; the caller
// (routes, bootstrap, background tick) decides whether the error is
// recoverable.
//
// Why isomorphic-git over shell git:
//   - Alpine base image has no git binary; pure-JS keeps the runtime
//     identical across dev / prod / public self-hosters.
//   - Auth is a callback (PAT username/password) instead of an env-mangled
//     git-credentials helper — simpler and harder to leak.
//   - No shell escape surface.

import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import * as fs from "node:fs";
import * as path from "node:path";
import { withLock, treeLockKey } from "../lib/locks";

export interface GitConfig {
  remote: string;
  branch: string;
  username?: string;     // GitHub: anything non-empty + PAT as password works
  token?: string;        // HTTPS PAT
  authorName?: string;   // commit author
  authorEmail?: string;
}

export interface GitStatus {
  configured: boolean;          // remote set somewhere (env or DB)
  repo: boolean;                // dir is a git working tree
  branch?: string;
  dirty: number;                // file count w/ uncommitted changes
  dirtyFiles: string[];         // those file paths (UI surfaces per-runbook diff)
  ahead: number;                // local commits not on origin
  behind: number;               // origin commits not in local
  lastFetchAt?: string;         // ISO timestamp of last successful fetch
  remote?: string;              // remote URL (masked elsewhere if needed)
  error?: string;               // surfaces fetch/auth failures w/o crashing status
}

function onAuth(cfg: GitConfig) {
  return () => {
    if (!cfg.token) return { cancel: true } as const;
    // GitHub accepts "x-access-token" as the username with a PAT; other
    // hosts mirror the same pattern. If the operator gave us a specific
    // username, honour it (e.g. azure devops needs an actual name).
    return { username: cfg.username || "x-access-token", password: cfg.token };
  };
}

export class GitClient {
  private lastFetchAt: string | undefined;
  private lastError: string | undefined;

  constructor(public dir: string, public cfg: GitConfig | null) {}

  // All mutating operations are serialized through these two locks:
  //   gitKey  — one git mutation at a time (the background fetch tick and a
  //             user pull/commit-push/checkout would otherwise write refs and
  //             packfiles into the same .git concurrently);
  //   treeKey — shared with the runbook/attachment write routes; held only
  //             around sections that rewrite the WORKING TREE (pull's
  //             checkout, branch switch) so file saves can't land inside the
  //             dirty-check → force-checkout window and get wiped.
  // Read-only calls (status, fileDiff, listBranches) stay lock-free — status
  // is polled by the UI and must not stall behind a slow fetch.
  private get gitKey() { return `git:${this.dir}`; }
  private get treeKey() { return treeLockKey(this.dir); }

  setConfig(cfg: GitConfig | null) {
    this.cfg = cfg;
    // Clear cached error so the next status call reflects the new config.
    this.lastError = undefined;
  }

  async isRepo(): Promise<boolean> {
    // resolveRef("HEAD") would walk into refs/heads/<branch> too and
    // throw on an unborn-branch state (empty remote, fresh clone — no
    // commits yet). We just want "is this a git working tree?", so a
    // stat on .git/HEAD is the right scope.
    try {
      await fs.promises.stat(path.join(this.dir, ".git", "HEAD"));
      return true;
    } catch {
      return false;
    }
  }

  // Mirror what `git status` would summarise into a single object the UI
  // can render as a badge: clean / dirty N / ahead N / behind N. Reading
  // multiple isomorphic-git endpoints is cheap on a small runbook repo
  // (sub-100ms in practice); revisit if a user wires up a giant repo.
  async status(): Promise<GitStatus> {
    if (!this.cfg) {
      return { configured: false, repo: false, dirty: 0, dirtyFiles: [], ahead: 0, behind: 0 };
    }
    const repo = await this.isRepo();
    if (!repo) {
      return {
        configured: true,
        repo: false,
        dirty: 0, dirtyFiles: [], ahead: 0, behind: 0,
        remote: this.cfg.remote,
        lastFetchAt: this.lastFetchAt,
        error: this.lastError,
      };
    }
    const branch = (await git.currentBranch({ fs, dir: this.dir })) || this.cfg.branch;

    // Dirty count = files whose workdir or stage differs from HEAD.
    // statusMatrix tuple: [filepath, head, workdir, stage]
    //   head:    0=absent  1=present
    //   workdir: 0=absent  1=identical-to-head  2=different
    //   stage:   0=absent  1=identical-to-head  2=different-from-head  3=different-from-workdir
    const matrix = await git.statusMatrix({ fs, dir: this.dir });
    const dirtyRows = matrix.filter(([, h, w, s]) => w !== h || s !== h);
    const dirtyFiles = dirtyRows.map((row) => row[0] as string);
    const dirty = dirtyRows.length;

    // Ahead/behind vs origin/<branch>. Both numbers come from counting
    // commits between the local/remote heads and their merge base. If
    // the remote ref isn't cached locally (no fetch yet), we skip both
    // — surfacing 0/0 instead of throwing keeps the badge useful.
    let ahead = 0;
    let behind = 0;
    try {
      const localOid = await git.resolveRef({ fs, dir: this.dir, ref: branch });
      const remoteOid = await git.resolveRef({ fs, dir: this.dir, ref: `refs/remotes/origin/${branch}` });
      if (localOid !== remoteOid) {
        const bases = await git.findMergeBase({ fs, dir: this.dir, oids: [localOid, remoteOid] });
        const base = bases[0];
        if (base) {
          const localLog = await git.log({ fs, dir: this.dir, ref: localOid, depth: 1000 });
          const remoteLog = await git.log({ fs, dir: this.dir, ref: remoteOid, depth: 1000 });
          const ai = localLog.findIndex((c) => c.oid === base);
          const bi = remoteLog.findIndex((c) => c.oid === base);
          ahead = ai < 0 ? 0 : ai;
          behind = bi < 0 ? 0 : bi;
        }
      }
    } catch {
      // remote ref absent → leave ahead/behind at 0
    }

    return {
      configured: true,
      repo: true,
      branch,
      dirty,
      dirtyFiles,
      ahead,
      behind,
      lastFetchAt: this.lastFetchAt,
      remote: this.cfg.remote,
      error: this.lastError,
    };
  }

  // Clone into this.dir. Caller verifies the dir is empty (or doesn't
  // exist) — isomorphic-git refuses to clone over an existing repo.
  // `singleBranch: false` so the UI's branch picker has every remote
  // branch available without a follow-up fetch; runbook repos are small
  // enough that the extra refs don't matter.
  async clone(): Promise<void> {
    return withLock(this.gitKey, () => this.cloneInner());
  }

  private async cloneInner(): Promise<void> {
    if (!this.cfg) throw new Error("no git config");
    await fs.promises.mkdir(this.dir, { recursive: true });
    await git.clone({
      fs,
      http,
      dir: this.dir,
      url: this.cfg.remote,
      ref: this.cfg.branch,
      singleBranch: false,
      depth: 50,       // shallow; we don't need ancient history in the dashboard
      onAuth: onAuth(this.cfg),
    });
    // Cloning a completely empty remote leaves HEAD pointing at
    // isomorphic-git's hardcoded fallback (`refs/heads/master`) even
    // when we requested `main`. Force HEAD to the configured branch so
    // the first commit + push land on the right ref.
    await this.forceHeadBranch();
    this.lastFetchAt = new Date().toISOString();
    this.lastError = undefined;
  }

  // Write HEAD as a symbolic ref to refs/heads/<cfg.branch>. Idempotent;
  // safe to call when the branch already exists (this just rewrites HEAD
  // to point at it).
  private async forceHeadBranch(): Promise<void> {
    if (!this.cfg) return;
    const headPath = path.join(this.dir, ".git", "HEAD");
    await fs.promises.writeFile(headPath, `ref: refs/heads/${this.cfg.branch}\n`, "utf8");
  }

  // Background-safe fetch: never throws to the caller, just records the
  // failure on the client so /api/git/status can surface it.
  async fetch(): Promise<void> {
    return withLock(this.gitKey, () => this.fetchInner());
  }

  // Lock-free body, shared with pull() — re-acquiring gitKey there would
  // deadlock (the chain mutex is not reentrant).
  private async fetchInner(): Promise<void> {
    if (!this.cfg) throw new Error("no git config");
    try {
      await git.fetch({
        fs,
        http,
        dir: this.dir,
        url: this.cfg.remote,
        ref: this.cfg.branch,
        singleBranch: true,
        prune: true,
        onAuth: onAuth(this.cfg),
      });
      this.lastFetchAt = new Date().toISOString();
      this.lastError = undefined;
    } catch (e) {
      this.lastError = String((e as Error)?.message ?? e);
      throw e;
    }
  }

  // ff-only pull: fetch + verify the remote contains our local head, then
  // checkout the remote oid. If the histories have diverged we throw and
  // the caller surfaces a "merge needed — resolve in shell" error.
  //
  // Refuse to run when the working tree has uncommitted changes — a
  // `force: true` checkout in that state silently wipes the user's
  // edits. The user is told to commit (or discard via shell) first.
  async pull(): Promise<{ ok: true } | { ok: false; reason: string }> {
    return withLock(this.gitKey, () => this.pullInner());
  }

  private async pullInner(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.cfg) throw new Error("no git config");
    const branch = this.cfg.branch;
    // Dirty-tree fast-fail. Saves the network round-trip when the tree is
    // obviously dirty — but it is NOT the authoritative check: the fetch
    // below takes seconds, and an autosave can write a file meanwhile. The
    // check that actually protects user edits is the one inside the tree
    // lock, immediately before the force checkout.
    const dirty = await this.dirtyCount();
    if (dirty > 0) {
      return {
        ok: false,
        reason: `working tree has ${dirty} uncommitted change(s) — commit or discard first`,
      };
    }
    await this.fetchInner();
    let localOid: string | null = null;
    try {
      localOid = await git.resolveRef({ fs, dir: this.dir, ref: branch });
    } catch {
      // Unborn branch — no commits locally yet. Anything the remote has
      // is by definition a fast-forward.
    }
    let remoteOid: string | null = null;
    try {
      remoteOid = await git.resolveRef({ fs, dir: this.dir, ref: `refs/remotes/origin/${branch}` });
    } catch {
      // Remote branch not yet present on disk (empty remote, or fetch
      // didn't pick this branch up). Nothing to pull.
      return { ok: true };
    }
    if (localOid === remoteOid) return { ok: true };
    if (localOid) {
      // Remote contains local? Walk back from remote and look for local oid.
      const remoteLog = await git.log({ fs, dir: this.dir, ref: remoteOid, depth: 1000 });
      if (!remoteLog.some((c) => c.oid === localOid)) {
        return { ok: false, reason: "diverged: local has commits not on remote" };
      }
    }
    // ff: write remote oid as the new branch head, then checkout to realise
    // it in the working tree. The tree lock + re-check close the TOCTOU
    // window: a save that landed during the fetch makes the tree dirty →
    // refuse (same UX as the fast-fail above); a save issued while we hold
    // the lock queues behind the checkout instead of racing it.
    return withLock(this.treeKey, async () => {
      const dirtyNow = await this.dirtyCount();
      if (dirtyNow > 0) {
        return {
          ok: false as const,
          reason: `working tree has ${dirtyNow} uncommitted change(s) — commit or discard first`,
        };
      }
      await git.writeRef({ fs, dir: this.dir, ref: `refs/heads/${branch}`, value: remoteOid, force: true });
      await git.checkout({ fs, dir: this.dir, ref: branch, force: true });
      return { ok: true as const };
    });
  }

  // statusMatrix walk shared by status(), pull() and checkoutBranch().
  // Tuple semantics documented on status() above.
  private async dirtyCount(): Promise<number> {
    const matrix = await git.statusMatrix({ fs, dir: this.dir });
    return matrix.filter(([, h, w, s]) => w !== h || s !== h).length;
  }

  // git add . + git commit -m <message> + git push. Returns the new oid
  // on success, or {ok:false, reason} on a known failure (non-ff push,
  // nothing to commit, auth).
  async commitAndPush(message: string): Promise<
    | { ok: true; oid: string; filesCommitted: number }
    | { ok: false; reason: string }
  > {
    // gitKey only: commit/push mutate .git (objects, refs) but never the
    // working tree, so file saves don't need to be excluded here.
    return withLock(this.gitKey, () => this.commitAndPushInner(message));
  }

  private async commitAndPushInner(message: string): Promise<
    | { ok: true; oid: string; filesCommitted: number }
    | { ok: false; reason: string }
  > {
    if (!this.cfg) throw new Error("no git config");
    const matrix = await git.statusMatrix({ fs, dir: this.dir });
    const changed = matrix.filter(([, h, w, s]) => w !== h || s !== h);
    if (changed.length === 0) return { ok: false, reason: "nothing to commit" };

    // Stage every changed path. Untracked → add. Deleted from workdir → remove.
    for (const [filepath, , workdir] of changed) {
      if (workdir === 0) {
        await git.remove({ fs, dir: this.dir, filepath });
      } else {
        await git.add({ fs, dir: this.dir, filepath });
      }
    }

    const oid = await git.commit({
      fs,
      dir: this.dir,
      message,
      author: {
        name: this.cfg.authorName || "sorack",
        email: this.cfg.authorEmail || "sorack@localhost",
      },
    });

    try {
      const pushRes = await git.push({
        fs,
        http,
        dir: this.dir,
        remote: "origin",
        ref: this.cfg.branch,
        onAuth: onAuth(this.cfg),
      });
      if (pushRes.error) {
        return { ok: false, reason: String(pushRes.error) };
      }
    } catch (e) {
      return { ok: false, reason: String((e as Error)?.message ?? e) };
    }
    return { ok: true, oid, filesCommitted: changed.length };
  }

  // Combined local + remote-tracking branch list with the current branch
  // pulled out, so the UI can render the picker without two requests.
  async listBranches(): Promise<{ current: string; branches: string[] }> {
    const current = (await git.currentBranch({ fs, dir: this.dir })) || this.cfg?.branch || "main";
    const [local, remote] = await Promise.all([
      git.listBranches({ fs, dir: this.dir }).catch(() => [] as string[]),
      git.listBranches({ fs, dir: this.dir, remote: "origin" }).catch(() => [] as string[]),
    ]);
    // `HEAD` shows up in the remote list when origin has a default HEAD;
    // drop it so the user sees the real branches only.
    const set = new Set<string>([...local, ...remote].filter((b) => b && b !== "HEAD"));
    return { current, branches: [...set].sort() };
  }

  // Create a new branch from the current HEAD. Does not checkout — the
  // caller decides whether to switch (the UI does both in one click).
  async createBranch(name: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
      return { ok: false, reason: "invalid branch name" };
    }
    return withLock(this.gitKey, async () => {
      const existing = await git.listBranches({ fs, dir: this.dir });
      if (existing.includes(name)) return { ok: false as const, reason: "branch already exists" };
      try {
        await git.branch({ fs, dir: this.dir, ref: name });
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, reason: String((e as Error)?.message ?? e) };
      }
    });
  }

  // Switch branches. Refuses on a dirty working tree (same guard as
  // pull — a force checkout otherwise wipes uncommitted edits). If the
  // branch only exists on origin, creates the local tracking ref first.
  async checkoutBranch(name: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    return withLock(this.gitKey, async () => {
      // Fast-fail outside the tree lock; the authoritative re-check sits
      // next to the checkout below (same TOCTOU shape as pull()).
      const dirty = await this.dirtyCount();
      if (dirty > 0) {
        return { ok: false as const, reason: `working tree has ${dirty} uncommitted change(s) — commit or discard first` };
      }
      const local = await git.listBranches({ fs, dir: this.dir });
      if (!local.includes(name)) {
        // Promote the remote-tracking ref into a local branch so checkout
        // has a head to land on; isomorphic-git's checkout doesn't
        // auto-create local branches from origin refs.
        try {
          const remoteOid = await git.resolveRef({ fs, dir: this.dir, ref: `refs/remotes/origin/${name}` });
          await git.writeRef({ fs, dir: this.dir, ref: `refs/heads/${name}`, value: remoteOid, force: true });
        } catch {
          return { ok: false as const, reason: "branch not found locally or on origin" };
        }
      }
      return withLock(this.treeKey, async () => {
        const dirtyNow = await this.dirtyCount();
        if (dirtyNow > 0) {
          return { ok: false as const, reason: `working tree has ${dirtyNow} uncommitted change(s) — commit or discard first` };
        }
        try {
          await git.checkout({ fs, dir: this.dir, ref: name, force: false });
          return { ok: true as const };
        } catch (e) {
          return { ok: false as const, reason: String((e as Error)?.message ?? e) };
        }
      });
    });
  }

  // Read a single file's HEAD-version + working-tree version so the UI
  // can render a per-runbook diff. Either side returns null when it
  // doesn't exist (unborn branch / file deleted / never committed) and
  // the caller treats null as "empty side" in the diff.
  async fileDiff(filepath: string): Promise<{ head: string | null; working: string | null }> {
    let head: string | null = null;
    try {
      const oid = await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" });
      const { blob } = await git.readBlob({ fs, dir: this.dir, oid, filepath });
      head = Buffer.from(blob).toString("utf8");
    } catch {
      // unborn branch, or filepath not in HEAD — leave head as null
    }
    let working: string | null = null;
    try {
      working = await fs.promises.readFile(path.join(this.dir, filepath), "utf8");
    } catch {
      // file deleted from working tree
    }
    return { head, working };
  }

  // Ensure the configured remote URL is set as `origin`. Useful when a
  // user changes the remote in Settings — isomorphic-git stores remotes in
  // .git/config and clone()'s initial origin is the URL we passed.
  async syncRemoteUrl(): Promise<void> {
    if (!this.cfg) return;
    const repo = await this.isRepo();
    if (!repo) return;
    await withLock(this.gitKey, () =>
      git.addRemote({ fs, dir: this.dir, remote: "origin", url: this.cfg!.remote, force: true }),
    );
  }
}

// Helper for the bootstrap step: returns true if `dir` exists and is
// non-empty (ignoring dotfiles other than .git which counts as content).
export async function dirHasContent(dir: string): Promise<boolean> {
  try {
    const entries = await fs.promises.readdir(dir);
    return entries.length > 0;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

// Wrap path.resolve so callers don't import path just for one join.
export function joinDir(dir: string, name: string): string {
  return path.join(dir, name);
}
