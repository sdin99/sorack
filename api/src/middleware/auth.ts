// requireAuth — the real security gate. The frontend login screen is just
// UX; without this, anyone could hit /api/* directly. Mounted in server.ts
// AFTER the public routes (health, login, logout) and BEFORE every data
// route.
//
// Two kinds of caller:
//   - a person with a session cookie, who can do anything they can do in
//     the UI;
//   - a programmatic caller with a bearer API key, limited to its scope.
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../lib/cookie.js";
import { readSession, type SessionUser } from "../lib/session.js";
import { verifyApiKey, type KeyScope } from "../lib/api-key.js";

export interface AuthContext {
  kind: "session" | "key";
  scope: KeyScope;
  // Present for sessions; absent for keys, which belong to no user.
  user?: SessionUser;
  // Present for keys — the operator-facing label, so logs and errors can
  // name which integration did something.
  keyName?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    user: SessionUser;
    auth: AuthContext;
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    const key = await verifyApiKey(header.slice(7).trim());
    if (!key) return c.json({ error: "unauthorized" }, 401);
    c.set("auth", { kind: "key", scope: key.scope, keyName: key.name });
    await next();
    return;
  }

  const cookie = getCookie(c, SESSION_COOKIE);
  const user = cookie ? await readSession(cookie) : null;
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  // A logged-in person is not scope-limited; the UI is the whole surface.
  c.set("auth", { kind: "session", scope: "write", user });
  await next();
};

// Anything that is not a plain read needs write scope.
//
// Keyed on the HTTP method rather than an allow-list of routes, so a route
// added later is covered by default. Getting that backwards — enumerate the
// mutating routes, forget one — fails open, and a permission check that
// fails open is the kind of gap that only shows up in an audit.
//
// POST /nodes/:id/probe/test is a POST and stays behind write on purpose:
// it makes outbound connections to an operator-supplied address, which is
// not something a read-only key should be able to trigger.
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireWrite: MiddlewareHandler = async (c, next) => {
  if (READ_METHODS.has(c.req.method)) {
    await next();
    return;
  }
  const auth = c.get("auth");
  if (auth?.scope !== "write") {
    return c.json(
      // The scope is echoed so a caller can tell "my key is wrong" (401)
      // from "my key is right and not allowed to do this" (403). The first
      // needs a new key, the second needs a configuration fix, and a bare
      // 403 leaves a reconciler unable to choose.
      { error: "this API key is read-only", scope: auth?.scope ?? "unknown" },
      403,
    );
  }
  await next();
};
