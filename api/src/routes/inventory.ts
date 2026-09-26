// Composite endpoint: returns everything the web shell needs to render the
// initial topology + sidebar. Web side ends up calling this once on load
// and then uses smaller endpoints for mutations.
import { Hono } from "hono";
import { db } from "../db/index.js";
import { nodes, edges } from "../db/schema.js";
import { withMonitored } from "../lib/monitored.js";

export const inventoryRoutes = new Hono();

inventoryRoutes.get("/", async (c) => {
  const [nodesRows, edgesRows] = await Promise.all([
    db.select().from(nodes),
    db.select().from(edges),
  ]);
  // Same shape as /api/nodes — the web loads the map from here, and a node
  // that looked monitored on one endpoint and not the other would be a
  // difference nobody would think to check.
  return c.json({ nodes: nodesRows.map(withMonitored), edges: edgesRows });
});
