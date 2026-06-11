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
