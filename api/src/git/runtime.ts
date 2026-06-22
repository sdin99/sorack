// Singleton GitClient + background fetch tick. The client lives for the
// process lifetime; its config is re-loaded after any /api/git/config
// PATCH so a UI change takes effect without restarting.
//
// Bootstrap (clone-if-empty) and the 5-minute fetch loop both live here
// so server.ts only has two top-level calls (`bootstrapClone()` and
// `startGitBackground()`), parallel to how the health collector wires
// in.

import { env } from "../lib/env";
import { emitEvent } from "../events";
import { GitClient, dirHasContent } from "./client";
import { loadGitConfig } from "./config";

let client: GitClient | null = null;

export async function getGitClient(): Promise<GitClient> {
  if (client) return client;
  const cfg = await loadGitConfig();
  client = new GitClient(env.RUNBOOKS_DIR, cfg);
  return client;
}

// On boot: if a remote is configured and the runbooks dir doesn't yet
// contain a git repo (empty volume on first launch), clone it. We
// deliberately refuse to clone over a dir that already has files but
// isn't a repo — that's almost certainly a config mistake, and silently
// blowing away user files would be unforgivable.
export async function bootstrapClone(): Promise<{ cloned: boolean; reason?: string }> {
  const c = await getGitClient();
  if (!c.cfg) return { cloned: false, reason: "not configured" };
  if (await c.isRepo()) {
    // Already a repo — keep the remote URL in sync in case it changed.
    try { await c.syncRemoteUrl(); } catch { /* non-fatal */ }
    return { cloned: false, reason: "already a repo" };
  }
  if (await dirHasContent(c.dir)) {
    return { cloned: false, reason: "dir not empty and not a git repo — refusing to clone" };
  }
  await c.clone();
  return { cloned: true };
}

// Background fetch. Runs every 5 minutes; emits `git.status_changed`
// only when the badge-relevant snapshot actually changed so we don't
// wake up every connected tab on a no-op tick.
let timer: NodeJS.Timeout | null = null;
let lastSnapshot: string | null = null;

async function tick() {
  const c = await getGitClient();
  if (!c.cfg) return;
  try { await c.fetch(); } catch { /* error already cached on client */ }
  const s = await c.status();
  const snap = JSON.stringify({
    branch: s.branch,
    dirty: s.dirty,
    ahead: s.ahead,
    behind: s.behind,
    error: s.error ?? null,
    repo: s.repo,
  });
  if (snap !== lastSnapshot) {
    lastSnapshot = snap;
    emitEvent({ type: "git.status_changed" });
  }
}

export function startGitBackground() {
  if (timer) return;
  // First tick immediately: server.ts awaits runMigrations() and
  // bootstrapClone() before calling this from the serve() callback, so
  // there is nothing left to wait for — a delay here only means the badge
  // shows a stale 0/0 ahead/behind until the first fetch lands. (Fetch is
  // serialized against user git actions by the client's internal lock.)
  void tick();
  timer = setInterval(() => { void tick(); }, 5 * 60 * 1000);
}

export function stopGitBackground() {
  if (timer) { clearInterval(timer); timer = null; }
}
