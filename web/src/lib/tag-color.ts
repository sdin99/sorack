// Deterministic per-tag color. Hashes the entire string (so "env:prod" stays
// the same color across every node it appears on) into an HSL hue, then locks
// saturation/lightness for legibility. Caller spreads the returned values as
// inline styles on the chip.
//
// Same value → same color. Different values → different hues, evenly spread
// since the hash is well-distributed. No palette table to maintain.

const HASH_INIT = 5381;

function djb2(s: string): number {
  let h = HASH_INIT;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0; // keep in 32-bit int
  }
  return Math.abs(h);
}

export interface TagColor {
  fg: string;
  bg: string;
  border: string;
}

// Tuned for dark mode (sorack's default). On light mode the bg+border alphas
// still read okay; fg loses some contrast but stays legible since chip text
// is short. If light-mode contrast becomes a complaint, swap to a
// CSS light-dark() variant.
export function tagColor(value: string): TagColor {
  const hue = djb2(value) % 360;
  return {
    fg: `hsl(${hue}, 60%, 72%)`,
    bg: `hsla(${hue}, 50%, 50%, 0.14)`,
    border: `hsla(${hue}, 50%, 60%, 0.38)`,
  };
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
