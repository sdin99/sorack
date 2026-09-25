// API key management. Session-only on purpose: a key must not be able to
// mint another key, or revoking the one you know about does not actually
// revoke access.
import { Hono, type Context } from "hono";
import {
  createApiKey, listApiKeys, revokeApiKey, isKeyScope, KEY_SCOPES,
} from "../lib/api-key.js";

export const keysRoutes = new Hono();

// A key must not be able to mint or revoke keys: otherwise revoking the one
// you know about does not actually revoke access.
function sessionOnly(c: Context): boolean {
  return c.get("auth")?.kind === "session";
}

keysRoutes.get("/", async (c) => {
  if (!sessionOnly(c)) return c.json({ error: "session required" }, 403);
  return c.json(await listApiKeys());
});

keysRoutes.post("/", async (c) => {
  if (!sessionOnly(c)) return c.json({ error: "session required" }, 403);
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scope = body?.scope;
  if (!name) return c.json({ error: "name is required" }, 400);
  if (name.length > 128) return c.json({ error: "name must be 128 chars or fewer" }, 400);
  if (!isKeyScope(scope)) {
    return c.json({ error: `scope must be one of: ${KEY_SCOPES.join(", ")}` }, 400);
  }
  const { key, row } = await createApiKey(name, scope);
  // The only time the raw key is ever returned.
  return c.json({ ...row, key }, 201);
});

keysRoutes.delete("/:id", async (c) => {
  if (!sessionOnly(c)) return c.json({ error: "session required" }, 403);
  const ok = await revokeApiKey(c.req.param("id"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
