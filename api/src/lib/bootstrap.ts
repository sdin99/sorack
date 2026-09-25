// First-run admin bootstrap (argocd-style). If no users exist, create the
// admin account. Password comes from SORACK_ADMIN_PASSWORD, or is randomly
// generated and printed to the log exactly once.
import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { env } from "./env.js";
import { hashPassword } from "./password.js";

export async function ensureAdminUser(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    // Say so on every boot. The generated password is printed exactly once,
    // in whichever pod happened to win the race — and if the first boots
    // crash-loop, that pod is the first one garbage-collected. Without this
    // line a later operator reading a later pod's log sees no auth output at
    // all and cannot tell "never bootstrapped" from "bootstrapped elsewhere,
    // password already gone".
    // eslint-disable-next-line no-console
    console.log("[auth] admin user already exists — bootstrap skipped");
    return;
  }

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
        `[auth] Set SORACK_ADMIN_PASSWORD to choose your own. Shown once —\n` +
        `[auth] this pod's log is the only copy. Save it now, or change it\n` +
        `[auth] under Settings once you are in. There is no reset flow: with\n` +
        `[auth] a user row present this bootstrap does nothing, so recovery\n` +
        `[auth] means updating auth.users directly (see docs).\n` +
        "========================================\n",
    );
  }
}
