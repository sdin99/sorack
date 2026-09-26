// Rules that apply to a node's `meta` whichever door it came through.
//
// They used to live only in the PATCH handler, so creation skipped them: a
// node POSTed with `probeSkipped: null` kept the null key, while the same
// node PATCHed a minute later had it removed. Two paths, one decision, and
// the paths disagreed — the same shape as the git config precedence that was
// resolved by having one resolver instead of two matching ones.
//
// Rendering hid it. A null and an absent key look identical on screen, so the
// only visible symptom was `meta` slowly filling with keys set to null.

// `null` means "delete this key". The UI sends it to clear a field, and a
// sync sends it to say "no reason this time" — either way the intent is the
// key's absence, and storing the null instead leaves a fact behind that
// nothing will ever read and everything has to step over.
export function stripNulls(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v !== null) out[k] = v;
  }
  return out;
}

// `meta.observed.*` belongs to the collector. PATCH has always refused it;
// POST accepted whatever was in the body, so a caller could seed a node with
// observations nothing had observed. It would survive until the first sweep
// of that node — and on a node with no probe, forever.
export function normalizeIncomingMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const { observed: _collectorOwned, ...rest } = meta as Record<string, unknown>;
  return stripNulls(rest);
}
