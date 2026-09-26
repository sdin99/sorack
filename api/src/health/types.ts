// Health probe contract.
//
// The collector (collector.ts) owns persistence; adapters are pure — they
// take a config + context and return a ProbeResult, never touching the DB.
// This keeps adapters trivial to add: a new source (k8s, proxmox, …) is one
// file implementing ProbeAdapter plus one line in registry.ts.

import type { nodes } from "../db/schema.js";

type NodeRow = typeof nodes.$inferSelect;

// Matches the inventory.status enum (schema.ts). The collector writes one
// of these onto node.status.
export type HealthStatus = "ok" | "warn" | "err" | "unknown";

// Per-node probe config, read from node.meta.probe. `type` selects the
// adapter; the remaining fields are adapter-specific (url, host, port, …)
// and validated by the adapter itself.
export interface ProbeConfig {
  type: string; // "http" | "tcp" | (future) "k8s" | "proxmox" | …
  timeoutMs?: number; // per-node override of env.HEALTH_TIMEOUT_MS
  [key: string]: unknown;
}

// What an adapter returns for one probe. Pure data.
export interface ProbeResult {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  // Extra observed data beyond health, merged into meta.observed.* by the
  // collector (e.g. { k8s: {...counts...} } from the k8s adapter, or
  // { metrics: {...} } from proxmox/prometheus). Health-only adapters
  // (http/tcp) leave this undefined. Keys here are collector-owned and the
  // UI never writes them.
  observed?: Record<string, unknown>;
  // What the probe saw that could stand as a node of its own. Consumed by
  // health/discovery.ts; adapters that do not discover leave it undefined.
  //
  // `kindsRead` is not decoration. A sweep that could not read a kind — RBAC,
  // an API server having a bad minute — sees exactly what a sweep of a
  // namespace with none of that kind sees. Without knowing which kinds were
  // actually read, the reconciler cannot tell "gone" from "not looked at",
  // and would mark things gone on the strength of a permission error.
  discovered?: {
    nodes?: DiscoveredNode[];
    kindsRead?: string[];
  };
}

// A cluster object, addressed by where it is rather than what anyone calls it.
export interface DiscoveredNode {
  coordinate: { namespace: string; kind: string; name: string };
  type: string;
  name: string;
}

// Context handed to every probe. `signal` carries the collector-level
// timeout (and shutdown abort) so adapters cancel cleanly.
export interface ProbeContext {
  node: NodeRow;
  signal: AbortSignal;
  timeoutMs: number;
}

export interface ProbeAdapter {
  readonly type: string;
  probe(config: ProbeConfig, ctx: ProbeContext): Promise<ProbeResult>;
}

// Stored back into node.meta.observed.health (merged, never replacing sibling
// meta keys). meta.observed.* is collector-owned; the frontend reads it for a
// small status detail block but never writes it.
export interface HealthRecord {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  lastCheckedAt: string; // ISO 8601
  source: string; // which adapter produced it (probe type)
}
