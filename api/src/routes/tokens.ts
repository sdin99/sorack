// API token management. Session-only on purpose: a token must not be able
// to mint another token, or revoking the one you know about does not
// actually revoke access.
import { Hono, type Context } from "hono";
import {
  createApiToken, listApiTokens, revokeApiToken, isTokenScope, TOKEN_SCOPES,
} from "../lib/api-token.js";

export const tokensRoutes = new Hono();

// A token must not be able to mint or revoke tokens: otherwise revoking the
// one you know about does not actually revoke access.
function sessionOnly(c: Context): boolean {
  return c.get("auth")?.kind === "session";
}

tokensRoutes.get("/", async (c) => {
  if (!sessionOnly(c)) return c.json({ error: "session required" }, 403);
  return c.json(await listApiTokens());
});

tokensRoutes.post("/", async (c) => {
  if (!sessionOnly(c)) return c.json({ error: "session required" }, 403);
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scope = body?.scope;
  if (!name) return c.json({ error: "name is required" }, 400);
  if (name.length > 128) return c.json({ error: "name must be 128 chars or fewer" }, 400);
  if (!isTokenScope(scope)) {
    return c.json({ error: `scope must be one of: ${TOKEN_SCOPES.join(", ")}` }, 400);
  }
  const { token, row } = await createApiToken(name, scope);
  // The only time the raw token is ever returned.
  return c.json({ ...row, token }, 201);
});

tokensRoutes.delete("/:id", async (c) => {
  if (!sessionOnly(c)) return c.json({ error: "session required" }, 403);
  const ok = await revokeApiToken(c.req.param("id"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
