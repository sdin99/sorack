import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { alerts } from "../db/schema.js";

export const alertsRoutes = new Hono();

alertsRoutes.get("/", async (c) => {
  const rows = await db.select().from(alerts).orderBy(desc(alerts.createdAt));
  return c.json(rows);
});
