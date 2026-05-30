// requireAuth — the real security gate. The frontend login screen is just
// UX; without this, anyone could hit /api/* directly. Mounted in server.ts
// AFTER the public routes (health, login, logout) and BEFORE every data
// route.
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../lib/cookie";
import { readSession, type SessionUser } from "../lib/session";

declare module "hono" {
  interface ContextVariableMap {
    user: SessionUser;
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await readSession(token) : null;
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
};
