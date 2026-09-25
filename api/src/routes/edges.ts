import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { edges } from "../db/schema.js";
import { validateEdge, ValidationError } from "../lib/validate.js";

export const edgesRoutes = new Hono();

edgesRoutes.get("/", async (c) => {
  const rows = await db.select().from(edges);
  return c.json(rows);
});

edgesRoutes.post("/", async (c) => {
  // See nodes.ts — a 400 that names the field, so a retrying client can
  // tell "my request is wrong" from "try again later".
  let input;
  try {
    input = validateEdge(await c.req.json().catch(() => null));
  } catch (e) {
    if (e instanceof ValidationError) return c.json({ error: e.message }, 400);
    throw e;
  }
  const [row] = await db.insert(edges).values(input as never).returning();
  return c.json(row, 201);
});

edgesRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  let input;
  try {
    input = validateEdge(await c.req.json().catch(() => null), { partial: true });
  } catch (e) {
    if (e instanceof ValidationError) return c.json({ error: e.message }, 400);
    throw e;
  }
  const [row] = await db.update(edges).set(input as never).where(eq(edges.id, id)).returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

edgesRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.delete(edges).where(eq(edges.id, id)).returning();
  if (result.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
