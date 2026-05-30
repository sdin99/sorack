// Shared status enum + a tiny localStorage-backed override layer for
// per-node description edits. The rest of the legacy mock fixtures that
// used to live here have been removed — live data flows through SorackData
// (api-backed) instead.
//
// Overrides are kept client-side for now: simple, no migration, and edits
// survive page reloads. Moves to the DB when per-user description history
// lands.

export const STATUS = { OK: "ok", WARN: "warn", ERR: "err" } as const;

const OVERRIDE_LS_KEY = "sorack-overrides-v1";
type OverrideBag = Record<string, Record<string, string | null>>;

function loadAll(): OverrideBag {
  try { return JSON.parse(localStorage.getItem(OVERRIDE_LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveAll(bag: OverrideBag): void {
  try { localStorage.setItem(OVERRIDE_LS_KEY, JSON.stringify(bag)); }
  catch { /* quota / private-mode — drop silently */ }
}

export function getOverride(nodeId: string, key: string): string | null | undefined {
  return loadAll()[nodeId]?.[key];
}

export function setOverride(nodeId: string, key: string, value: string | null): void {
  const bag = loadAll();
  const node = bag[nodeId] ?? {};
  if (value === null) delete node[key];
  else node[key] = value;
  if (Object.keys(node).length === 0) delete bag[nodeId];
  else bag[nodeId] = node;
  saveAll(bag);
}
