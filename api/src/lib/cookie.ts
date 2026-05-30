// Session cookie helpers. httpOnly so JS (and thus XSS) can't read the
// token; sameSite=Lax blocks cross-site state-changing requests (CSRF);
// secure is on by default (https), toggled off only for local http debug.
import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { env } from "./env";

export const SESSION_COOKIE = "sorack_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days, matches session TTL

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
