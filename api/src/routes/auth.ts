import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../lib/password";
import { createSession, destroySession, destroyAllSessions } from "../lib/session";
import { setSessionCookie, clearSessionCookie, SESSION_COOKIE } from "../lib/cookie";
import { getCookie } from "hono/cookie";
import { rateLimit, rateLimitReset } from "../lib/ratelimit";
import { requireAuth } from "../middleware/auth";

export const authRoutes = new Hono();

// Constant-cost dummy verify for unknown usernames — keeps login response
// time uniform whether or not the user exists (blocks enumeration).
const DUMMY_HASH = hashPassword("dummy-password-not-real");

// brute-force throttle: 10 attempts / 15 min per client IP
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;

function clientIp(c: any): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

authRoutes.post("/login", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`login:${ip}`, { windowMs: LOGIN_WINDOW_MS, max: LOGIN_MAX })) {
    return c.json({ error: "too many attempts" }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) return c.json({ error: "invalid credentials" }, 400);

  const [user] = await db.select().from(users).where(eq(users.username, username));
  // Always run a verify so timing doesn't reveal whether the user exists.
  const ok = user
    ? verifyPassword(password, user.passwordHash)
    : (verifyPassword(password, DUMMY_HASH), false);

  if (!ok || !user) return c.json({ error: "invalid credentials" }, 401);

  rateLimitReset(`login:${ip}`); // legit login — clear the counter
  const token = await createSession(user.id);
  setSessionCookie(c, token);
  return c.json({ user: { username: user.username } });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await destroySession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// requireAuth applied per-route: /me is the one auth route that needs a
// valid session (login/logout stay public).
authRoutes.get("/me", requireAuth, (c) => {
  return c.json({ user: c.get("user") });
});

const MIN_PASSWORD_LEN = 8;

authRoutes.patch("/password", requireAuth, async (c) => {
  const me = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  if (next.length < MIN_PASSWORD_LEN) {
    return c.json({ error: "password too short" }, 400);
  }
  const [row] = await db.select().from(users).where(eq(users.id, me.id));
  if (!row || !verifyPassword(current, row.passwordHash)) {
    return c.json({ error: "current password incorrect" }, 401);
  }
  await db.update(users).set({ passwordHash: hashPassword(next) }).where(eq(users.id, me.id));
  // Revoke every existing session (in case the old password leaked), then
  // issue a fresh one for the current client so they stay logged in.
  await destroyAllSessions(me.id);
  const token = await createSession(me.id);
  setSessionCookie(c, token);
  return c.json({ ok: true });
});
