import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL } from "../lib/env.js";
import * as schema from "./schema.js";

// `prepare: false` — required for runtime statements with drizzle-orm
// when the connection pool may reset (k8s rolling restart).
const client = postgres(DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
export { schema };
