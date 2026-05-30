// Opaque session tokens backed by the auth.sessions table. The raw token
// lives only in the user's cookie; we store sha256(token + AUTH_SECRET)
// so a DB leak can't be replayed as a live session. Server-side rows mean
// logout and "kill all sessions" actually revoke access (unlike stateless
// JWT).
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sessions, users } from "../db/schema";
import { env } from "./env";

const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function hashToken(token: string): string {
  return createHash("sha256").update(`${token}${env.AUTH_SECRET}`).digest("hex");
}

export interface SessionUser {
  id: string;
  username: string;
}

// Create a session for a user; returns the raw token to put in the cookie.
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  return token;
}

// Resolve a cookie token to the owning user, or null if missing/expired.
// Expired rows are cleaned up opportunistically.
export async function readSession(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  const [user] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, row.userId));
  if (!user) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  return { id: user.id, username: user.username };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
