import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { edges } from "../db/schema";

export const edgesRoutes = new Hono();

edgesRoutes.get("/", async (c) => {
  const rows = await db.select().from(edges);
  return c.json(rows);
});

edgesRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(edges).values(body).returning();
  return c.json(row, 201);
});

edgesRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const [row] = await db.update(edges).set(body).where(eq(edges.id, id)).returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

edgesRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.delete(edges).where(eq(edges.id, id)).returning();
  if (result.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
