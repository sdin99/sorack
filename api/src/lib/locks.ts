// Per-key async mutex built on a promise chain. Serializes read-modify-write
// sections that touch the same runbook's file + DB row, so two concurrent
// PATCHes (e.g. the editor's autosave {markdown} and a status-dropdown
// {status}) can't each read the same stale row and overwrite the other's
// field on disk.
//
// In-process only — assumes a single api replica (the current deployment).
// If the api ever scales horizontally, replace this with a cross-process
// lock (e.g. Postgres advisory locks keyed on the runbook id).

const chains = new Map<string, Promise<unknown>>();

// Lock key for the runbooks working tree as a whole. Held by anything that
// writes files inside RUNBOOKS_DIR (runbook saves, attachment writes) and by
// git operations that rewrite the working tree (pull's checkout, branch
// switch). This is what makes pull's dirty-check → checkout sequence
// race-free against a concurrent autosave: the editor's write either lands
// before the check (pull refuses on the dirty tree) or queues until the
// checkout is done — never in between, where a force checkout would silently
// wipe it.
//
// Lock ordering (deadlock-free by construction):
//   runbook routes:  runbook:<id> → tree:<dir>
//   git client:      git:<dir>    → tree:<dir>
// Nothing acquires in the opposite direction, so no cycle is possible.
export function treeLockKey(dir: string): string {
  return `tree:${dir}`;
}

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Stored tails never reject (see below), so chaining with .then is enough.
  const run = prev.then(fn);
  // Keep the chain alive past a rejection — the caller still sees the error
  // through `run`, but the next holder must not inherit it.
  const tail = run.catch(() => undefined);
  chains.set(key, tail);
  void tail.finally(() => {
    // Drop the entry once the chain drains so idle keys don't accumulate.
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}
