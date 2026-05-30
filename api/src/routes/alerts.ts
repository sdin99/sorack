import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { alerts } from "../db/schema";

export const alertsRoutes = new Hono();

alertsRoutes.get("/", async (c) => {
  const rows = await db.select().from(alerts).orderBy(desc(alerts.createdAt));
  return c.json(rows);
});
