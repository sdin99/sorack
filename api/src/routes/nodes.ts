import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { nodes } from "../db/schema";
import { getAdapter } from "../health/registry";
import { env } from "../lib/env";

export const nodesRoutes = new Hono();

nodesRoutes.get("/", async (c) => {
  const rows = await db.select().from(nodes);
  return c.json(rows);
});

nodesRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(nodes).where(eq(nodes.id, id));
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

nodesRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(nodes).values(body).returning();
  return c.json(row, 201);
});

nodesRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { meta: incomingMeta, ...rest } = body as Record<string, unknown>;

  // meta needs a merge, not a wholesale replace: a partial PATCH (e.g. just
  // an icon change) must not drop sibling keys, and the UI must never be able
  // to clobber meta.observed.* (collector-owned). So we fetch the current
  // meta, deep-merge the incoming root + manual keys, and always keep the
  // DB's observed bag — the UI's copy of it is read-only and may be stale.
  let metaUpdate: Record<string, unknown> = {};
  if (incomingMeta !== undefined && incomingMeta !== null) {
    const [current] = await db.select().from(nodes).where(eq(nodes.id, id));
    if (!current) return c.json({ error: "not found" }, 404);
    const cur = (current.meta ?? {}) as Record<string, unknown>;
    const inc = incomingMeta as Record<string, unknown>;
    const { observed: _ignored, manual: incManual, softwareProbes: incSwProbes, ...incRest } = inc;
    const curManual = (cur.manual ?? {}) as Record<string, unknown>;
    // Merge manual; a null value means "delete this key" (the UI sends null to
    // remove a field) — strip nulls so they don't linger in the bag.
    const mergedManual = { ...curManual, ...((incManual as Record<string, unknown>) ?? {}) };
    for (const key of Object.keys(mergedManual)) {
      if (mergedManual[key] === null) delete mergedManual[key];
    }
    // B-3: software probes partial merge — incoming { [swId]: ProbeConfig | null }
    // is merged into the current bag, with null entries removed (the UI sends
    // null to drop one software's monitoring). Same shape as manual.
    const curSwProbes = (cur.softwareProbes ?? {}) as Record<string, unknown>;
    const mergedSwProbes = { ...curSwProbes, ...((incSwProbes as Record<string, unknown>) ?? {}) };
    const removedSwIds: string[] = [];
    for (const key of Object.keys(mergedSwProbes)) {
      if (mergedSwProbes[key] === null) {
        delete mergedSwProbes[key];
        removedSwIds.push(key);
      }
    }
    // B-3 cleanup: when meta.software changes, drop probes + observed data
    // for softwares the node no longer runs. Without this a stale software
    // probe (and its collected metrics) lingers forever after the user
    // unchecks that software in the gallery. `software` may be an array of
    // ids, a single string (tolerated), or null (all removed).
    if ("software" in incRest) {
      const raw = incRest.software;
      const activeSet = new Set<string>();
      const list: unknown[] = Array.isArray(raw) ? raw : (typeof raw === "string" ? [raw] : []);
      for (const v of list) if (typeof v === "string" && v) activeSet.add(v);
      for (const sid of Object.keys(mergedSwProbes)) {
        if (!activeSet.has(sid) && !removedSwIds.includes(sid)) {
          delete mergedSwProbes[sid];
          removedSwIds.push(sid);
        }
      }
    }
    // Removing the probe (probe: null) means "stop monitoring this node" —
    // also clear its collected data so stale health/k8s don't linger on a node
    // the collector no longer touches. BUT preserve observed.software: the
    // infra probe and the per-software probes are independent aspects, and
    // stopping infra monitoring shouldn't wipe the software readings the
    // collector is still updating. (Previously this wiped everything.)
    const removingProbe = "probe" in incRest && incRest.probe == null;
    let mergedObserved: Record<string, unknown> = (cur.observed ?? {}) as Record<string, unknown>;
    if (removingProbe) {
      const sw = mergedObserved.software;
      mergedObserved = sw ? { software: sw } : {};
    }
    // B-3: if software probes were just removed, drop their per-software
    // observed bags too so the StatusLine doesn't keep showing a stale
    // reading from a software the operator just unmonitored. Also drop the
    // empty `observed.software` key if no software bag survives.
    if (removedSwIds.length > 0 && mergedObserved.software) {
      const obsSw = { ...(mergedObserved.software as Record<string, unknown>) };
      for (const sid of removedSwIds) delete obsSw[sid];
      if (Object.keys(obsSw).length === 0) {
        mergedObserved = { ...mergedObserved };
        delete mergedObserved.software;
      } else {
        mergedObserved = { ...mergedObserved, software: obsSw };
      }
    }
    const mergedMeta: Record<string, unknown> = {
      ...cur, // carries the fresh observed bag
      ...incRest, // root config keys: probe / iconKind / idAuto / statusPrimary
      manual: mergedManual,
      softwareProbes: mergedSwProbes,
      observed: mergedObserved, // collector-owned — never taken from the body
    };
    // softwareProbes: drop empty bag so meta stays tidy on nodes that never
    // had any software probe set.
    if (Object.keys(mergedSwProbes).length === 0) delete mergedMeta.softwareProbes;
    // A null root value means "delete this key" — lets a partial PATCH REMOVE
    // root config (clearing iconKind on a type change, removing the probe),
    // not just add/overwrite it.
    for (const key of Object.keys(mergedMeta)) {
      if (mergedMeta[key] === null) delete mergedMeta[key];
    }
    metaUpdate = { meta: mergedMeta };
  }

  const [row] = await db
    .update(nodes)
    .set({ ...rest, ...metaUpdate, updatedAt: new Date() })
    .where(eq(nodes.id, id))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

// Run a probe config once, on demand, WITHOUT persisting — powers the detail
// panel's "test connection" button so the operator can verify a probe before
// saving it. Admin-only (behind requireAuth) by virtue of the /api/* guard.
nodesRoutes.post("/:id/probe/test", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as Record<string, unknown>;
  if (!body || typeof body.type !== "string") {
    return c.json({ error: "probe config with a type is required" }, 400);
  }
  // Now that the type is a string, the body satisfies the ProbeConfig shape
  // (`type: string` + extra adapter-specific keys validated by the adapter).
  const config = body as { type: string; [k: string]: unknown };
  const [node] = await db.select().from(nodes).where(eq(nodes.id, id));
  if (!node) return c.json({ error: "not found" }, 404);
  const adapter = getAdapter(config.type);
  if (!adapter) return c.json({ status: "unknown", message: `no adapter for "${config.type}"` });
  const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : env.HEALTH_TIMEOUT_MS;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await adapter.probe(config, { node, signal: ac.signal, timeoutMs });
    return c.json({ status: r.status, latencyMs: r.latencyMs, message: r.message });
  } catch (e) {
    return c.json({ status: "err", message: e instanceof Error ? e.message : String(e) });
  } finally {
    clearTimeout(t);
  }
});

nodesRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.delete(nodes).where(eq(nodes.id, id)).returning();
  if (result.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
