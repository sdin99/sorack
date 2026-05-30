// Run drizzle migrations against the current DATABASE_URL.
// Invoked as part of api Pod startup, or manually via `pnpm db:migrate`.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { DATABASE_URL } from "../lib/env";

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("[migrate] done");
await client.end();
