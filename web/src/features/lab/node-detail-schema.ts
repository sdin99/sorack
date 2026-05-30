// Per-type detail body schema.
//
// The single renderer (TypeBody in LabDetail.tsx) walks TYPE_DETAIL[type] and
// renders each entry in order:
//   - a FieldDef reads one scalar from a meta bag and shows it as a labeled
//     row. Manual fields read meta.manual.<key>; everything else reads
//     meta.observed.<key> (collector/adapter-owned).
//   - a WidgetDef invokes a reusable widget component (gauges, childList, …).
//
// `source` is the contract each collector adapter implements (k8s / proxmox /
// prom). Today only `manual` fields and derived widgets have live data;
// adapter-sourced fields and widgets stay hidden until their adapter writes
// the matching key into meta.observed. So the schema can declare the full
// intended shape now and light up field-by-field as the data layer lands —
// this is the "design the output first" backlog made concrete.
//
// Field labels are technical identifiers shown verbatim in both languages
// (house convention: don't translate technical terms). Widget section headers
// are i18n keys.

// "system" = host-axis adapter (ssh / snmp / agent). Not yet built — fields
// declared with this source render as `(auto)` until a host-axis adapter lands.
// Kept separate from "proxmox" on purpose: proxmox is a SOFTWARE that happens
// to know the host, but host identity (os/kernel/uptime/metrics) belongs on
// the infra axis so it doesn't disappear when you swap software around.
export type FieldSource = "manual" | "system" | "k8s" | "proxmox" | "prom" | "router";

export interface FieldDef {
  key: string; // bag key: meta.manual.<key> (manual) | meta.observed.<key> (else)
  label: string; // shown verbatim
  unit?: string;
  source: FieldSource;
}

export type WidgetName = "gauges" | "childList" | "countGrid" | "workloadList";

export interface WidgetDef {
  widget: WidgetName;
  header: string; // i18n key under nd.widget.*
  source: FieldSource;
  metrics?: string[]; // gauges: which meta.observed.metrics.* keys to render
  childTypes?: string[]; // childList: which child node types to include
}

export type DetailEntry = FieldDef | WidgetDef;

export function isWidget(e: DetailEntry): e is WidgetDef {
  return (e as WidgetDef).widget !== undefined;
}

// Read a field's current value. Lookup order, regardless of source:
//   1. meta.manual.<key>           — user-set override always wins. Lets the
//      operator hand-type a value into an auto field (e.g. OS on a host
//      without a system adapter yet, or correct a wrong vendor reading).
//   2. axis-specific observed bag  — auto-sourced reading from the adapter.
// Axis is chosen by the caller via `swId`:
//   - omit swId (infra spec)       → meta.observed.<key>  (host-axis bag)
//   - pass swId (software section) → meta.observed.software[swId].<key>
// fieldValue does NOT cross axes (software bag must not pretend to fill a
// host-axis field, and vice versa). "Manual override" is per-node, not
// per-software — manual lives on the node and beats every observed bag.
// Manual-source fields skip step 2 entirely (there's no observed counterpart
// to fall back to), so an unset manual field reads as undefined.
export function fieldValue(node: any, def: FieldDef, swId?: string): unknown {
  const meta = node?.meta ?? {};
  const manualVal = meta.manual?.[def.key];
  if (manualVal !== undefined && manualVal !== null && manualVal !== '') return manualVal;
  if (def.source === "manual") return undefined;
  if (swId) return meta.observed?.software?.[swId]?.[def.key];
  return meta.observed?.[def.key];
}

// ── Axis 1: infra type → ordered detail entries ─────────────────────
// (host/vm/pod/namespace/router/…). Drives icon, topology, base monitoring.
// Real manual keys come first; adapter-pending fields/widgets follow and stay
// hidden until populated.
export const TYPE_DETAIL: Record<string, DetailEntry[]> = {
  host: [
    { key: "role", label: "role", source: "manual" },
    { key: "hostname", label: "hostname", source: "manual" },
    { key: "ip", label: "IP", source: "manual" },
    { key: "vendor", label: "vendor", source: "manual" },
    // host-axis identity + metrics. source: "system" = host-axis adapter
    // (ssh/snmp/agent), not yet implemented — fields stay (auto) until that
    // adapter lands. Deliberately NOT sourced from "proxmox" — proxmox is a
    // software, and host info must survive swapping software in and out.
    { key: "os", label: "OS", source: "system" },
    { key: "kernel", label: "kernel", source: "system" },
    { key: "uptime", label: "uptime", source: "system" },
    { widget: "gauges", header: "nd.widget.resources", source: "system", metrics: ["cpu", "mem", "disk"] },
  ],
  vm: [
    { key: "role", label: "role", source: "manual" },
    { key: "vmId", label: "VMID", source: "manual" },
    { key: "ip", label: "IP", source: "manual" },
    { key: "k8s_version", label: "k8s version", source: "manual" },
    { key: "pool", label: "pool", source: "manual" },
    // host-axis (system adapter) auto-fills os/kernel/uptime/mem/disk/cpu from
    // a node_exporter running INSIDE the guest. vcpu/mac/guest_os live on the
    // same axis (any host-axis adapter can supply them) but the current
    // node_exporter mapping doesn't extract them yet — those fields stay
    // (auto) until the system adapter is extended.
    { key: "os", label: "OS", source: "system" },
    { key: "kernel", label: "kernel", source: "system" },
    { key: "guest_os", label: "guest OS", source: "system" },
    { key: "vcpu", label: "vCPU", source: "system" },
    { key: "uptime", label: "uptime", source: "system" },
    { key: "mac", label: "MAC", source: "system" },
    { widget: "gauges", header: "nd.widget.resources", source: "system", metrics: ["cpu", "mem", "disk"] },
  ],
  container: [
    { key: "role", label: "role", source: "manual" },
    { key: "ctId", label: "CTID", source: "manual" },
    { key: "ip", label: "IP", source: "manual" },
    { key: "port", label: "port", source: "manual" },
    { key: "os", label: "OS", source: "system" },
    { key: "kernel", label: "kernel", source: "system" },
    { key: "vcpu", label: "vCPU", source: "system" },
    { key: "uptime", label: "uptime", source: "system" },
    { widget: "gauges", header: "nd.widget.resources", source: "system", metrics: ["cpu", "mem", "disk"] },
  ],
  k8s_namespace: [
    { key: "apps", label: "apps", source: "k8s" },
    { key: "certs", label: "certs", source: "k8s" },
    { key: "lb_ip", label: "LB IP", source: "k8s" },
    { widget: "countGrid", header: "nd.widget.workloads", source: "k8s" },
    { widget: "gauges", header: "nd.widget.requests", source: "prom", metrics: ["cpu_req", "mem_req"] },
    { widget: "workloadList", header: "nd.widget.pods", source: "k8s" },
  ],
  router: [
    { key: "vendor", label: "vendor", source: "manual" },
    { key: "model", label: "model", source: "manual" },
    { key: "ip", label: "IP", source: "manual" },
    { key: "lanCidr", label: "LAN CIDR", source: "manual" },
    { key: "features", label: "features", source: "manual" },
    { key: "version", label: "firmware", source: "manual" },
    { key: "wan_ip", label: "WAN IP", source: "manual" },
    { key: "uptime", label: "uptime", source: "router" },
  ],
  k8s_cluster: [
    { key: "distribution", label: "distribution", source: "manual" },
    { key: "cni", label: "CNI", source: "manual" },
    { key: "podCidr", label: "pod CIDR", source: "manual" },
    { key: "serviceCidr", label: "service CIDR", source: "manual" },
    { key: "version", label: "version", source: "k8s" },
    { key: "nodes", label: "nodes", source: "k8s" },
    { widget: "countGrid", header: "nd.widget.workloads", source: "k8s" },
  ],
  k8s_service: [
    { key: "svc_type", label: "type", source: "k8s" },
    { key: "clusterIP", label: "cluster IP", source: "k8s" },
    { key: "ports", label: "ports", source: "k8s" },
    { key: "selector", label: "selector", source: "k8s" },
    { key: "endpoints", label: "endpoints", source: "k8s" },
  ],
  k8s_pvc: [
    { key: "storageClass", label: "storage class", source: "k8s" },
    { key: "capacity", label: "capacity", source: "k8s" },
    { key: "accessMode", label: "access mode", source: "k8s" },
    { key: "volumeName", label: "volume", source: "k8s" },
    { key: "phase", label: "phase", source: "k8s" },
    { widget: "gauges", header: "nd.widget.requests", source: "prom", metrics: ["disk"] },
  ],
  share: [
    { key: "protocol", label: "protocol", source: "manual" },
    { key: "size", label: "size", source: "manual" },
    { key: "export", label: "export", source: "manual" },
    { key: "path", label: "path", source: "manual" },
    { widget: "gauges", header: "nd.widget.requests", source: "proxmox", metrics: ["disk"] },
  ],
};

// ── Axis 2: software/solution running on a node (optional) ──────────
// node.meta.software holds the id; its fields merge AFTER the infra fields.
// Two orthogonal axes (infra × software) avoid the combinatorial explosion of
// one flat type list — e.g. a "PostgreSQL Pod" = infra:pod + software:postgresql,
// getting both pods' and Postgres' fields. Software monitoring is deferred (P2);
// for now software contributes fields/identity only.
export interface SoftwareTemplate {
  name: string;
  category: string;
  // One-line description shown on the gallery card + its drill-down detail.
  description?: string;
  // Infra types this software can run on (e.g. PostgreSQL on host/vm/container,
  // not on a router). Omitted = applies to any infra.
  appliesTo?: string[];
  entries: DetailEntry[];
  // B-3: default probe type for this software's monitoring. Like INFRA_META.probe
  // but for the software axis — proxmox-ve → 'proxmox' (talk to the PVE API),
  // postgresql → 'tcp' (5432), jellyfin → 'http' (/health), adguard → 'tcp'.
  // Stored at meta.softwareProbes[swId], observed at meta.observed.software[swId].health.
  probe?: string;
}
// Software runs on a "compute-ish" substrate. (pod will join when added.)
const COMPUTE = ["host", "vm", "container"];
export const SOFTWARE: Record<string, SoftwareTemplate> = {
  "proxmox-ve": {
    name: "Proxmox VE",
    category: "Hypervisor",
    description: "Virtualization platform running VMs and containers.",
    appliesTo: ["host"],
    probe: "proxmox",
    entries: [
      { key: "pveVersion", label: "Proxmox version", source: "proxmox" },
      { key: "vmCount", label: "VMs", source: "proxmox" },
      { key: "ctCount", label: "CTs", source: "proxmox" },
    ],
  },
  postgresql: {
    name: "PostgreSQL",
    category: "Database",
    description: "Relational database server.",
    appliesTo: COMPUTE,
    probe: "tcp",
    entries: [
      { key: "pgVersion", label: "version", source: "manual" },
      { key: "dbSize", label: "DB size", source: "prom" },
      { key: "connections", label: "connections", source: "prom" },
    ],
  },
  jellyfin: {
    name: "Jellyfin",
    category: "Media",
    description: "Self-hosted media server for movies, TV, and music.",
    appliesTo: COMPUTE,
    probe: "http",
    entries: [
      { key: "jellyfinVersion", label: "version", source: "manual" },
      { key: "activeStreams", label: "active streams", source: "prom" },
    ],
  },
  adguard: {
    name: "AdGuard Home",
    category: "Network",
    description: "Network-wide DNS ad and tracker blocker.",
    appliesTo: COMPUTE,
    probe: "tcp",
    entries: [
      { key: "adguardVersion", label: "version", source: "manual" },
      { key: "dnsQueries", label: "DNS queries (24h)", source: "prom" },
      { key: "blockedPct", label: "blocked %", source: "prom" },
    ],
  },
};

// Default probe type for a software id (the probe form's preset on a software
// card, mirror of defaultProbeType() for infra). Returns 'tcp' as a safe fallback
// for unknown / unprobed software so the form still renders.
export function softwareProbeType(swId: string): string {
  return SOFTWARE[swId]?.probe || 'tcp';
}

// Software offered for a given infra type (empty for router/storage/etc.).
export function softwareForInfra(infraType: string): Array<{ id: string; tpl: SoftwareTemplate }> {
  return Object.entries(SOFTWARE)
    .filter(([, s]) => !s.appliesTo || s.appliesTo.includes(infraType))
    .map(([id, tpl]) => ({ id, tpl }));
}
// Is a given software id valid on an infra type? (used to drop incompatible
// software when the infra changes — e.g. host→router shouldn't keep postgres)
export function softwareFitsInfra(softwareId: string | undefined | null, infraType: string): boolean {
  if (!softwareId) return true;
  const s = SOFTWARE[softwareId];
  return !s || !s.appliesTo || s.appliesTo.includes(infraType);
}

// Infra metadata (display name + category for the picker, default probe type,
// one-line description for the gallery card). Entries live in TYPE_DETAIL
// above; kept here so that literal isn't churned.
export const INFRA_META: Record<string, { name: string; category: string; probe: string; description: string }> = {
  router: { name: "Router", category: "Network", probe: "tcp", description: "Network gateway connecting your LAN to the internet." },
  host: { name: "Host", category: "Compute", probe: "system", description: "Physical or bare-metal machine." },
  vm: { name: "VM", category: "Compute", probe: "system", description: "Virtual machine running on a hypervisor." },
  container: { name: "Container", category: "Compute", probe: "system", description: "Lightweight OS-level container (e.g. LXC)." },
  k8s_cluster: { name: "K8s Cluster", category: "Kubernetes", probe: "k8s", description: "A Kubernetes cluster." },
  k8s_namespace: { name: "K8s Namespace", category: "Kubernetes", probe: "k8s", description: "A namespace grouping workloads within a cluster." },
  k8s_service: { name: "K8s Service", category: "Kubernetes", probe: "k8s", description: "A service exposing pods within a cluster." },
  k8s_pvc: { name: "K8s PVC", category: "Kubernetes", probe: "k8s", description: "A persistent volume claim for stateful storage." },
  share: { name: "Share", category: "Storage", probe: "tcp", description: "A network file share (NFS, SMB)." },
};

// meta.software is an array of software ids. A bare string (single-select era)
// is tolerated and wrapped, so no migration is strictly required.
export function softwareIds(node: any): string[] {
  const s = node?.meta?.software;
  if (Array.isArray(s)) return s.filter(Boolean);
  return s ? [s] : [];
}
// Infra-only detail entries — software lives in its own sections, not merged
// into the spec.
export function infraEntries(node: any): DetailEntry[] {
  return TYPE_DETAIL[node?.type] || TYPE_DETAIL[node?.kind] || [];
}
// Software still addable to this node (compatible with its infra + not already
// present).
export function availableSoftware(node: any): Array<{ id: string; tpl: SoftwareTemplate }> {
  const have = new Set(softwareIds(node));
  return softwareForInfra(node?.type).filter(({ id }) => !have.has(id));
}
// On an infra change, keep only software that still fits the new infra.
export function keepCompatibleSoftware(node: any, newType: string): string[] {
  return softwareIds(node).filter((id) => softwareFitsInfra(id, newType));
}
// Default probe type for a node's infra (the probe form's preset).
export function defaultProbeType(node: any): string {
  return INFRA_META[node?.type]?.probe ?? "tcp";
}

// Humanize a leftover manual key the schema didn't declare, so user data is
// never silently dropped (e.g. someone adds meta.manual.foo by hand).
export function humanizeKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}
