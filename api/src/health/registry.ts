// Probe adapter registry — maps a probe `type` to its adapter.
//
// Adding a source is one import + one register() call here (plus the
// adapter file). The collector never changes.

import type { ProbeAdapter } from "./types";
import { httpAdapter } from "./adapters/http";
import { tcpAdapter } from "./adapters/tcp";
import { k8sAdapter } from "./adapters/k8s";
import { proxmoxAdapter } from "./adapters/proxmox";
import { systemAdapter } from "./adapters/system";

const adapters = new Map<string, ProbeAdapter>();

function register(a: ProbeAdapter): void {
  adapters.set(a.type, a);
}

register(httpAdapter);
register(tcpAdapter);
register(k8sAdapter);
register(proxmoxAdapter);
register(systemAdapter); // first transport: node_exporter scrape
// Phase 2+: register(prometheusAdapter); register(sorackAgentAdapter); …

export function getAdapter(type: string): ProbeAdapter | undefined {
  return adapters.get(type);
}

export function knownTypes(): string[] {
  return [...adapters.keys()];
}
