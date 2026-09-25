import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
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
  // Same relationship twice is a no-op the caller should know about, not a
  // silent second row. (id is a uuid here, so the collision is semantic
  // rather than a key violation — the check has to be explicit.)
  const dupe = await db
    .select({ id: edges.id })
    .from(edges)
    .where(and(
      eq(edges.sourceId, input.sourceId as string),
      eq(edges.targetId, input.targetId as string),
      eq(edges.type, (input.type ?? "contains") as string),
    ));
  if (dupe.length > 0) {
    return c.json({ error: "this edge already exists", id: dupe[0].id }, 409);
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
