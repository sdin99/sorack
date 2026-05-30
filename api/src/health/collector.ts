// Health collector — periodic in-process poller.
//
// Every interval it probes the nodes that opted in (via meta.probe and/or
// meta.softwareProbes), writes the results to meta.observed.health (infra)
// and meta.observed.software[swId].health (per-software, B-3), and flips
// node.status only when the primary aspect's status changes. Nodes without
// ANY probe are never touched.
//
// Ownership boundary: the collector owns meta.observed.* (machine-produced
// data). The UI owns meta.manual.* (user-declared display fields) and root
// config keys (probe/softwareProbes/iconKind/idAuto/statusPrimary). The
// PATCH route strips incoming meta.observed so a stale UI write can never
// clobber what we persist here.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { nodes } from "../db/schema";
import { env } from "../lib/env";
import { getAdapter } from "./registry";
import type { HealthRecord, ProbeConfig } from "./types";

type NodeRow = typeof nodes.$inferSelect;

let timer: NodeJS.Timeout | null = null;
let running = false; // re-entrancy guard: skip a tick if the previous sweep is still in flight

export function startCollector(): void {
  if (!env.HEALTH_ENABLED) {
    console.log("[health] collector disabled (SORACK_HEALTH_ENABLED=false)");
    return;
  }
  if (timer) return; // idempotent — never double-start
  console.log(`[health] collector on, interval=${env.HEALTH_INTERVAL_MS}ms`);
  timer = setInterval(() => void tick(), env.HEALTH_INTERVAL_MS);
  void tick(); // run once shortly after boot
}

export function stopCollector(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  if (running) return; // previous sweep still going → skip this beat
  running = true;
  try {
    const rows = await db.select().from(nodes);
    // A node is a target if it has EITHER an infra probe or any software
    // probe set. Both are polled in the same sweep.
    const targets = rows.filter((n) => {
      const meta = (n.meta ?? {}) as Record<string, unknown>;
      if (isProbeConfig(meta.probe)) return true;
      const sw = (meta.softwareProbes ?? {}) as Record<string, unknown>;
      return Object.values(sw).some(isProbeConfig);
    });
    await Promise.all(targets.map(probeNode));
  } catch (e) {
    console.error("[health] tick failed:", e);
  } finally {
    running = false;
  }
}

function isProbeConfig(p: unknown): p is ProbeConfig {
  return !!p && typeof p === "object" && typeof (p as { type?: unknown }).type === "string";
}

// Run one probe (infra or one software's). Returns the health record plus any
// adapter-provided observed extras (e.g. observed.k8s for the k8s adapter,
// observed.metrics for proxmox).
async function runProbe(node: NodeRow, cfg: ProbeConfig): Promise<{ record: HealthRecord; extra?: Record<string, unknown> }> {
  const adapter = getAdapter(cfg.type);
  const timeoutMs = typeof cfg.timeoutMs === "number" ? cfg.timeoutMs : env.HEALTH_TIMEOUT_MS;
  const now = (): string => new Date().toISOString();
  if (!adapter) {
    return { record: { status: "unknown", message: `no adapter for probe type "${cfg.type}"`, lastCheckedAt: now(), source: cfg.type } };
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await adapter.probe(cfg, { node, signal: ac.signal, timeoutMs });
    return {
      record: { status: r.status, latencyMs: r.latencyMs, message: r.message, lastCheckedAt: now(), source: cfg.type },
      extra: r.observed,
    };
  } catch (e) {
    return { record: { status: "err", message: e instanceof Error ? e.message : String(e), lastCheckedAt: now(), source: cfg.type } };
  } finally {
    clearTimeout(t);
  }
}

// One sweep of one node: run its infra probe + each of its software probes
// in parallel, then persist all results in a single DB write to keep
// observed.* atomic per node.
async function probeNode(node: NodeRow): Promise<void> {
  const meta = (node.meta as Record<string, unknown>) ?? {};
  const swProbes = (meta.softwareProbes ?? {}) as Record<string, unknown>;

  const infraTask = isProbeConfig(meta.probe)
    ? runProbe(node, meta.probe as ProbeConfig)
    : Promise.resolve(undefined);
  const swEntries = Object.entries(swProbes).filter(([, cfg]) => isProbeConfig(cfg));
  const swTasks = swEntries.map(([swId, cfg]) =>
    runProbe(node, cfg as ProbeConfig).then((r) => [swId, r] as const),
  );

  const [infra, ...swResults] = await Promise.all([infraTask, ...swTasks]);
  await persist(node, infra, swResults as Array<readonly [string, { record: HealthRecord; extra?: Record<string, unknown> }]>);
}

// Persist all aspects' results in one write. observed.* is owned entirely
// by the collector so we can replace its keys without merging — anything the
// UI tried to send was already stripped by the PATCH route.
//   - meta.observed.health        → infra probe record  (omitted if no infra probe)
//   - meta.observed.{adapter keys} → infra extras       (e.g. observed.k8s, observed.metrics)
//   - meta.observed.software[swId] → { health, ...extras } per software probe
//   - node.status                  → PRIMARY aspect's status (statusPrimary,
//                                    fallback infra → first software)
async function persist(
  node: NodeRow,
  infra: { record: HealthRecord; extra?: Record<string, unknown> } | undefined,
  swResults: Array<readonly [string, { record: HealthRecord; extra?: Record<string, unknown> }]>,
): Promise<void> {
  const meta = (node.meta ?? {}) as Record<string, unknown>;
  const observed = (meta.observed ?? {}) as Record<string, unknown>;

  // Build observed.software: each swId → { health, ...extras }. Software
  // bag is REPLACED (not merged with current) so removing a software probe
  // is reflected here; the PATCH route already nulled it on its own path,
  // but a tick mid-removal still converges.
  const obsSoftware: Record<string, unknown> = {};
  for (const [swId, r] of swResults) {
    obsSoftware[swId] = { ...(r.extra ?? {}), health: r.record };
  }

  // Build observed root: keep current adapter-extras for infra (unless a new
  // probe overrides them), set health if infra ran, set software bag.
  const newObserved: Record<string, unknown> = { ...observed };
  if (infra) {
    Object.assign(newObserved, infra.extra ?? {});
    newObserved.health = infra.record;
  }
  newObserved.software = obsSoftware;

  // Primary aspect — what node.status reflects. Default: infra if it ran,
  // else first software, else current status (no flip).
  const primaryKey = typeof meta.statusPrimary === "string" ? (meta.statusPrimary as string) : undefined;
  const primaryRecord: HealthRecord | undefined =
    (primaryKey === "infra" && infra?.record)
    || (primaryKey && primaryKey !== "infra"
        ? swResults.find(([id]) => id === primaryKey)?.[1].record
        : undefined)
    || infra?.record
    || swResults[0]?.[1].record;

  const statusChanged = primaryRecord && node.status !== primaryRecord.status;

  await db
    .update(nodes)
    .set({
      ...(statusChanged ? { status: primaryRecord.status } : {}),
      meta: { ...meta, observed: newObserved },
      updatedAt: new Date(),
    })
    .where(eq(nodes.id, node.id));
}
