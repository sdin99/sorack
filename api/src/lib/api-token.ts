// Long-lived tokens for programmatic callers — sync scripts, reconcilers,
// anything that is not a person with a browser.
//
// Storage follows session.ts: only sha256(token + AUTH_SECRET) is kept, so a
// database leak cannot be replayed. Unlike sessions these never expire, which
// makes revocation the only way out — hence lastUsedAt, so an operator can
// tell a live integration from one that was abandoned before deleting it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiTokens } from "../db/schema.js";
import { env } from "./env.js";

export type TokenScope = "read" | "write";

export const TOKEN_SCOPES: readonly TokenScope[] = ["read", "write"] as const;

export function isTokenScope(v: unknown): v is TokenScope {
  return typeof v === "string" && (TOKEN_SCOPES as readonly string[]).includes(v);
}

// A fixed, searchable prefix. Secret scanners (gitleaks and friends) match on
// shapes like this, so a token pasted into a commit or an issue has a chance
// of being caught before it is published.
const PREFIX = "sorack_pat_";

function hashToken(token: string): string {
  return createHash("sha256").update(`${token}${env.AUTH_SECRET}`).digest("hex");
}

export interface ApiTokenRow {
  id: string;
  name: string;
  scope: TokenScope;
  createdAt: Date;
  lastUsedAt: Date | null;
}

// Returns the raw token. It is not recoverable afterwards — the caller must
// show it once and move on.
export async function createApiToken(
  name: string,
  scope: TokenScope,
): Promise<{ token: string; row: ApiTokenRow }> {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiTokens)
    .values({ name, scope, tokenHash: hashToken(token) })
    .returning();
  return {
    token,
    row: {
      id: row.id,
      name: row.name,
      scope: row.scope as TokenScope,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    },
  };
}

// Resolve a bearer token to its scope, or null. Records lastUsedAt so an
// operator can see which tokens are live before revoking one.
export async function verifyApiToken(
  raw: string,
): Promise<{ id: string; name: string; scope: TokenScope } | null> {
  if (!raw.startsWith(PREFIX)) return null;
  const candidate = hashToken(raw);
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, candidate));
  if (!row) return null;

  // The lookup above is already an equality match on a hash, so this adds
  // little — but comparing the hashes constant-time costs nothing and keeps
  // the habit where it belongs.
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(row.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Fire-and-forget: a failed bookkeeping write must not fail the request.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => undefined);

  return { id: row.id, name: row.name, scope: row.scope as TokenScope };
}

export async function listApiTokens(): Promise<ApiTokenRow[]> {
  const rows = await db.select().from(apiTokens);
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      scope: r.scope as TokenScope,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function revokeApiToken(id: string): Promise<boolean> {
  const deleted = await db.delete(apiTokens).where(eq(apiTokens.id, id)).returning({ id: apiTokens.id });
  return deleted.length > 0;
}
