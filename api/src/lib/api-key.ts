// Long-lived API keys for programmatic callers — sync scripts, reconcilers,
// anything that is not a person with a browser.
//
// Storage follows session.ts: only sha256(key + AUTH_SECRET) is kept, so a
// database leak cannot be replayed. Unlike sessions these never expire, which
// makes revocation the only way out — hence lastUsedAt, so an operator can
// tell a live integration from one that was abandoned before deleting it.
//
// ‼ The table is `auth.api_tokens`, not `api_keys`, and that mismatch is
// deliberate. Renaming it would mean an older image can no longer find its
// own table, and rolling the image back to a pinned digest is how this
// deployment recovers from a bad release. A rename would turn that recovery
// into an outage of every key, to buy nothing a reader of this file can use.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { env } from "./env.js";

export type KeyScope = "read" | "write";

export const KEY_SCOPES: readonly KeyScope[] = ["read", "write"] as const;

export function isKeyScope(v: unknown): v is KeyScope {
  return typeof v === "string" && (KEY_SCOPES as readonly string[]).includes(v);
}

// A fixed, searchable prefix. Secret scanners (gitleaks and friends) match on
// shapes like this, so a key pasted into a commit or an issue has a chance of
// being caught before it is published.
const PREFIX = "sorack_key_";

// `sorack_pat_` is what keys minted before the rename carry. Accepted, never
// issued. Dropping it would silently invalidate every key already in use and
// in Infisical — and the symptom would be a 401, which reads as "wrong key"
// rather than "we changed the rules", so nobody would look here.
const ACCEPTED_PREFIXES = [PREFIX, "sorack_pat_"] as const;

function hashKey(key: string): string {
  return createHash("sha256").update(`${key}${env.AUTH_SECRET}`).digest("hex");
}

export interface ApiKeyRow {
  id: string;
  name: string;
  scope: KeyScope;
  createdAt: Date;
  lastUsedAt: Date | null;
}

// Returns the raw key. It is not recoverable afterwards — the caller must
// show it once and move on.
export async function createApiKey(
  name: string,
  scope: KeyScope,
): Promise<{ key: string; row: ApiKeyRow }> {
  const key = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({ name, scope, keyHash: hashKey(key) })
    .returning();
  return {
    key,
    row: {
      id: row.id,
      name: row.name,
      scope: row.scope as KeyScope,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    },
  };
}

// Resolve a bearer key to its scope, or null. Records lastUsedAt so an
// operator can see which keys are live before revoking one.
export async function verifyApiKey(
  raw: string,
): Promise<{ id: string; name: string; scope: KeyScope } | null> {
  if (!ACCEPTED_PREFIXES.some((p) => raw.startsWith(p))) return null;
  const candidate = hashKey(raw);
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, candidate));
  if (!row) return null;

  // The lookup above is already an equality match on a hash, so this adds
  // little — but comparing the hashes constant-time costs nothing and keeps
  // the habit where it belongs.
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(row.keyHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Fire-and-forget: a failed bookkeeping write must not fail the request.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => undefined);

  return { id: row.id, name: row.name, scope: row.scope as KeyScope };
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const rows = await db.select().from(apiKeys);
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      scope: r.scope as KeyScope,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const deleted = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning({ id: apiKeys.id });
  return deleted.length > 0;
}
