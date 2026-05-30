import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { runbooks } from "../db/schema";

export const runbooksRoutes = new Hono();

runbooksRoutes.get("/", async (c) => {
  const rows = await db.select().from(runbooks);
  return c.json(rows);
});

runbooksRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(runbooks).where(eq(runbooks.id, id));
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});
