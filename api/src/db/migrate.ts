// Run drizzle migrations against the current DATABASE_URL.
//
// Two entry points:
//   - runMigrations() — exported so server.ts can apply migrations on boot
//     before any route handler runs (idempotent: drizzle skips applied ones).
//   - this file as a script — `pnpm db:migrate` for manual runs.
//
// migrationsFolder is resolved relative to THIS file so it works whether
// the api runs from `src/` (tsx in the dev pod) or `dist/` (compiled),
// without depending on process.cwd.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { DATABASE_URL } from "../lib/env";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(HERE, "./migrations");

// Network errors that mean "the database isn't reachable yet" vs. "something
// is really wrong." Cold-start cluster races (sorack pod Ready before
// postgres-0 / CoreDNS settles) raise EAI_AGAIN or ECONNREFUSED here — bare
// `await runMigrations()` at server startup would otherwise crash the
// process and tsx watch would sit idle until a code change retriggers it.
const TRANSIENT_NET_CODES = new Set(["EAI_AGAIN", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"]);

function isTransientNetError(e: unknown): boolean {
  // postgres/drizzle wrap the underlying dns/socket error; walk the cause
  // chain (Node 16+ Error.cause) to find the original code.
  let cur: any = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur.code && TRANSIENT_NET_CODES.has(cur.code)) return true;
    cur = cur.cause;
  }
  return false;
}

export async function runMigrations(): Promise<void> {
  const MAX_WAIT_MS = 60_000;
  const INTERVAL_MS = 2_000;
  const startedAt = Date.now();
  let attempt = 0;
  while (true) {
    attempt++;
    const client = postgres(DATABASE_URL, { max: 1 });
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      return;
    } catch (e) {
      const elapsed = Date.now() - startedAt;
      if (isTransientNetError(e) && elapsed < MAX_WAIT_MS) {
        const remaining = Math.max(0, Math.round((MAX_WAIT_MS - elapsed) / 1000));
        console.warn(`[migrate] postgres not reachable (attempt ${attempt}); retrying in ${INTERVAL_MS / 1000}s (≤${remaining}s left)…`);
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
        continue;
      }
      throw e;
    } finally {
      // `client.end()` itself can throw if connect never succeeded; swallow
      // so the original error (or success) propagates as the result.
      await client.end().catch(() => {});
    }
  }
}

// When invoked directly (`pnpm db:migrate`), run + exit.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  await runMigrations();
  console.log("[migrate] done");
  process.exit(0);
}
