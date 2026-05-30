// First-run admin bootstrap (argocd-style). If no users exist, create the
// admin account. Password comes from SORACK_ADMIN_PASSWORD, or is randomly
// generated and printed to the log exactly once.
import { randomBytes } from "node:crypto";
import { db } from "../db";
import { users } from "../db/schema";
import { env } from "./env";
import { hashPassword } from "./password";

export async function ensureAdminUser(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const username = env.ADMIN_USERNAME;
  const generated = !env.ADMIN_PASSWORD;
  const password = env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");

  // onConflictDoNothing + username UNIQUE guards against two replicas (or
  // a restart racing a slow insert) both creating the admin.
  const inserted = await db
    .insert(users)
    .values({ username, passwordHash: hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: users.id });

  if (inserted.length > 0 && generated) {
    // eslint-disable-next-line no-console
    console.log(
      "\n========================================\n" +
        `[auth] Initial admin user created.\n` +
        `[auth]   username: ${username}\n` +
        `[auth]   password: ${password}\n` +
        `[auth] Set SORACK_ADMIN_PASSWORD to choose your own. Shown once.\n` +
        "========================================\n",
    );
  }
}
