// Composite endpoint: returns everything the web shell needs to render the
// initial topology + sidebar. Web side ends up calling this once on load
// and then uses smaller endpoints for mutations.
import { Hono } from "hono";
import { db } from "../db";
import { nodes, edges } from "../db/schema";

export const inventoryRoutes = new Hono();

inventoryRoutes.get("/", async (c) => {
  const [nodesRows, edgesRows] = await Promise.all([
    db.select().from(nodes),
    db.select().from(edges),
  ]);
  return c.json({ nodes: nodesRows, edges: edgesRows });
});
