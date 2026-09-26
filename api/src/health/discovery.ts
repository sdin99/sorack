// Turn what a probe found into nodes.
//
// The rules are argued in https://github.com/sdin99/sorack/issues/3; the ones
// that shape this file:
//
//   identity      A discovered node's id is the cluster coordinate,
//                 `<namespace>/<kind>/<name>`, so re-running produces the
//                 same id for the same object.
//
//   ownership     An existing node claims a coordinate by pointing its probe
//                 at it. Inventories name intents ("the thing that backs up
//                 the portal"); coordinates name objects. The two routinely
//                 differ — an entry called `portal-backup` may point at a
//                 CronJob named `db-backup` — so matching on names would
//                 duplicate exactly the nodes someone cared enough to
//                 describe.
//
//   ‼ deletion    Never. A sweep marks `meta.discovered.goneAt` and an
//                 operator decides. A probe that gets a 403, or hits an API
//                 server having a bad minute, sees what a probe of an emptied
//                 namespace sees; if that could delete nodes, one bad
//                 afternoon erases the map and reports success.
//
//                 The refinement, from the infra team: where the probe DOES
//                 know the difference, use it. `kindsRead` says which kinds
//                 were actually read, and only those may be marked gone.
//                 "Absence of observation is not absence" applied crudely
//                 would throw away evidence the probe already had.
//
//                 And a node that comes back clears its own mark, so a bad
//                 afternoon heals when it ends without anyone undoing it.
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { nodes } from "../db/schema.js";
import type { DiscoveredNode } from "./types.js";
import { coordinateId, probeClaims, probeForCoordinate } from "./coordinates.js";

export interface ReconcileResult {
  created: string[];
  equipped: string[]; // discovered earlier, probe attached now
  returned: string[]; // had goneAt, seen again
  gone: string[];
  claimed: string[]; // an existing node already owns this coordinate
}

export async function reconcileDiscovered(
  parentId: string,
  found: DiscoveredNode[],
  kindsRead: string[],
): Promise<ReconcileResult> {
  const out: ReconcileResult = { created: [], equipped: [], returned: [], gone: [], claimed: [] };
  const all = await db.select().from(nodes);
  const byId = new Map(all.map((n) => [n.id, n]));
  const seen = new Set<string>();

  for (const d of found) {
    const id = coordinateId(d.coordinate);
    seen.add(id);

    // Claimed by something other than the node we would create? Leave it
    // entirely alone — it is already probed and already holds its readings.
    const owner = all.find((n) => n.id !== id && probeClaims(n.meta, n.name, d.coordinate));
    if (owner) {
      out.claimed.push(owner.id);
      continue;
    }

    const existing = byId.get(id);
    if (!existing) {
      await db.insert(nodes).values({
        id,
        type: d.type,
        name: d.name,
        parentId,
        status: "unknown",
        meta: {
          probe: probeForCoordinate(d.coordinate),
          discovered: {
            by: parentId,
            coordinate: d.coordinate,
            firstSeenAt: new Date().toISOString(),
            // Marks that discovery put the probe there. Used only to decide
            // whether an existing node without one is a node created before
            // probes were attached, or one whose probe an operator removed
            // on purpose — the two look identical otherwise, and re-adding a
            // probe someone deliberately took off is its own annoyance.
            probeAttached: true,
          },
        },
      } as never).onConflictDoNothing();
      out.created.push(id);
      continue;
    }

    // Back after being marked gone. Clear the mark rather than making a
    // person undo what a permission error did.
    const meta = (existing.meta ?? {}) as Record<string, unknown>;
    const disc = (meta.discovered ?? {}) as Record<string, unknown>;

    // Heal nodes discovered before probes were attached. Bounded by the
    // marker: a node discovery has already equipped once is never touched
    // again, so removing its probe stays removed.
    if (!disc.probeAttached && !meta.probe) {
      await db.update(nodes)
        .set({
          meta: {
            ...meta,
            probe: probeForCoordinate(d.coordinate),
            discovered: { ...disc, probeAttached: true },
          },
          updatedAt: new Date(),
        })
        .where(eq(nodes.id, id));
      out.equipped.push(id);
    }

    if (disc.goneAt) {
      const { goneAt: _cleared, ...rest } = disc;
      await db.update(nodes)
        .set({ meta: { ...meta, discovered: rest }, updatedAt: new Date() })
        .where(eq(nodes.id, id));
      out.returned.push(id);
    }
  }

  // Mark what this sweep looked for and did not find. Scoped to nodes this
  // parent discovered, and to kinds this sweep actually read.
  const readable = new Set(kindsRead);
  for (const row of all) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const disc = meta.discovered as Record<string, unknown> | undefined;
    if (!disc || disc.by !== parentId || disc.goneAt) continue;
    const coord = disc.coordinate as DiscoveredNode["coordinate"] | undefined;
    if (!coord || !readable.has(coord.kind)) continue;
    if (seen.has(row.id)) continue;
    await db.update(nodes)
      .set({ meta: { ...meta, discovered: { ...disc, goneAt: new Date().toISOString() } }, updatedAt: new Date() })
      .where(eq(nodes.id, row.id));
    out.gone.push(row.id);
  }

  return out;
}
