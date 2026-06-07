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
      return { configured: false, repo: false, dirty: 0, ahead: 0, behind: 0 };
    }
    const repo = await this.isRepo();
    if (!repo) {
      return {
        configured: true,
        repo: false,
        dirty: 0, ahead: 0, behind: 0,
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
    const dirty = matrix.filter(([, h, w, s]) => w !== h || s !== h).length;

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
      ahead,
      behind,
      lastFetchAt: this.lastFetchAt,
      remote: this.cfg.remote,
      error: this.lastError,
    };
  }

  // Clone into this.dir. Caller verifies the dir is empty (or doesn't
  // exist) — isomorphic-git refuses to clone over an existing repo.
  async clone(): Promise<void> {
    if (!this.cfg) throw new Error("no git config");
    await fs.promises.mkdir(this.dir, { recursive: true });
    await git.clone({
      fs,
      http,
      dir: this.dir,
      url: this.cfg.remote,
      ref: this.cfg.branch,
      singleBranch: true,
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
    if (!this.cfg) throw new Error("no git config");
    const branch = this.cfg.branch;
    // Dirty-tree guard. Mirrors the same statusMatrix walk we use to
    // surface the count in status(); rejecting here is strictly safer
    // than landing the destructive checkout below.
    const matrix = await git.statusMatrix({ fs, dir: this.dir });
    const dirty = matrix.filter(([, h, w, s]) => w !== h || s !== h).length;
    if (dirty > 0) {
      return {
        ok: false,
        reason: `working tree has ${dirty} uncommitted change(s) — commit or discard first`,
      };
    }
    await this.fetch();
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
    // ff: write remote oid as the new branch head, then checkout to
    // realise it in the working tree.
    await git.writeRef({ fs, dir: this.dir, ref: `refs/heads/${branch}`, value: remoteOid, force: true });
    await git.checkout({ fs, dir: this.dir, ref: branch, force: true });
    return { ok: true };
  }

  // git add . + git commit -m <message> + git push. Returns the new oid
  // on success, or {ok:false, reason} on a known failure (non-ff push,
  // nothing to commit, auth).
  async commitAndPush(message: string): Promise<
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

  // Ensure the configured remote URL is set as `origin`. Useful when a
  // user changes the remote in Settings — isomorphic-git stores remotes in
  // .git/config and clone()'s initial origin is the URL we passed.
  async syncRemoteUrl(): Promise<void> {
    if (!this.cfg) return;
    const repo = await this.isRepo();
    if (!repo) return;
    await git.addRemote({ fs, dir: this.dir, remote: "origin", url: this.cfg.remote, force: true });
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
