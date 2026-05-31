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

export async function runMigrations(): Promise<void> {
  const client = postgres(DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

// When invoked directly (`pnpm db:migrate`), run + exit.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  await runMigrations();
  console.log("[migrate] done");
  process.exit(0);
}
