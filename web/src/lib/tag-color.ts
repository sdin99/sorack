// Deterministic per-tag hue. Hashes the entire string (so "env:prod" stays
// the same color across every node it appears on) into an HSL hue.
//
// Same value → same hue. Different values → different hues, evenly spread
// since the hash is well-distributed. No palette table to maintain.
//
// Caller passes the hue as a CSS variable (`--tg-h`) on the chip/dot element;
// the actual fg/bg/border come from CSS so each theme picks its own
// saturation/lightness tuning. See `.tag-chip` / `.tag-dot` in global.css.

const HASH_INIT = 5381;

function djb2(s: string): number {
  let h = HASH_INIT;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0; // keep in 32-bit int
  }
  return Math.abs(h);
}

export function tagHue(value: string): number {
  return djb2(value) % 360;
}

// Parse a hybrid tag into its key/value parts. Bare label ("wireguard") →
// { key: null, value: "wireguard" }. "env:prod" → { key: "env", value: "prod" }.
// Whitespace around the colon trimmed; nothing else normalized. Only the FIRST
// colon splits (so "url:http://x" doesn't get over-split).
export function parseTag(raw: string): { key: string | null; value: string } {
  const i = raw.indexOf(":");
  if (i < 0) return { key: null, value: raw };
  return { key: raw.slice(0, i).trim(), value: raw.slice(i + 1).trim() };
}
