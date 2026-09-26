// Is anything watching this node?
//
// `status` records what a probe said. A node with no probe has had nothing
// said about it, and that is a different fact from a probe that ran and could
// not decide — a 403, a timeout, a CronJob whose Job was garbage-collected.
// Both showed as `unknown`, so five of nine nodes on the infra team's map sat
// permanently grey and the colour stopped meaning anything.
//
// Derived, never stored. "No probe is configured" is a property of the node's
// own config, so writing it into `status` would create a second place for the
// same fact to be wrong — and a probe added later would leave it stale.
import type { ProbeConfig } from "../health/types.js";

function isProbeConfig(p: unknown): p is ProbeConfig {
  return !!p && typeof p === "object" && typeof (p as { type?: unknown }).type === "string";
}

// Same test the collector uses to pick what to probe, so "monitored" and
// "actually probed" cannot disagree.
export function isMonitored(meta: unknown): boolean {
  const m = (meta ?? {}) as Record<string, unknown>;
  if (isProbeConfig(m.probe)) return true;
  const sw = (m.softwareProbes ?? {}) as Record<string, unknown>;
  return Object.values(sw).some(isProbeConfig);
}

// The node as the API hands it out: the stored row plus what can be worked
// out from it.
export function withMonitored<T extends { meta?: unknown }>(row: T): T & { monitored: boolean } {
  return { ...row, monitored: isMonitored(row.meta) };
}
