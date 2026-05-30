// Tiny in-memory sliding-window rate limiter. Single-replica dev deploy,
// so a process-local Map is enough — no Redis. Used to throttle login
// brute-force. If the app ever scales horizontally, swap for a shared
// store (the call site stays the same).

interface Window {
  hits: number[]; // timestamps (ms)
}

const buckets = new Map<string, Window>();

interface Options {
  windowMs: number;
  max: number;
}

// Returns true if the request is allowed, false if the limit is exceeded.
// `now` is injectable for tests; defaults to Date.now().
export function rateLimit(key: string, opts: Options, now: number = Date.now()): boolean {
  const cutoff = now - opts.windowMs;
  const w = buckets.get(key) ?? { hits: [] };
  // drop timestamps outside the window
  w.hits = w.hits.filter((t) => t > cutoff);
  if (w.hits.length >= opts.max) {
    buckets.set(key, w);
    return false;
  }
  w.hits.push(now);
  buckets.set(key, w);
  return true;
}

// Clear a key's history (e.g. on successful login so a legit user isn't
// penalised for earlier typos).
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}
