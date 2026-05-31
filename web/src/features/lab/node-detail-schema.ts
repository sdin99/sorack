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

// Localized text — either a bare string (same for all langs, e.g. tech terms)
// or an inline { en, ko } object. Kept inline in this schema (rather than i18n
// keys) so adding/editing a field shows both languages next to each other.
export type Localized = string | { en: string; ko: string };

// Resolve a Localized value for a given language code (i18n.language).
// Bare strings pass through; objects pick by language prefix, falling back to en.
export function loc(v: Localized | undefined, lang?: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  return (lang || "").toLowerCase().startsWith("ko") ? v.ko : v.en;
}

export interface FieldDef {
  key: string; // bag key: meta.manual.<key> (manual) | meta.observed.<key> (else)
  label: string; // shown verbatim
  unit?: string;
  source: FieldSource;
  hint?: Localized; // one-line description shown in the gallery picker
}

export type WidgetName = "gauges" | "childList" | "countGrid" | "workloadList";

export interface WidgetDef {
  widget: WidgetName;
  header: string; // i18n key under nd.widget.*
  source: FieldSource;
  metrics?: string[]; // gauges: which meta.observed.metrics.* keys to render
  childTypes?: string[]; // childList: which child node types to include
  hint?: Localized; // one-line description shown in the gallery picker
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
    { key: "role", label: "role", source: "manual", hint: { en: "What this host does (e.g. hypervisor, storage)", ko: "이 호스트의 역할 (예: 하이퍼바이저, 스토리지)" } },
    { key: "hostname", label: "hostname", source: "manual", hint: { en: "Local network hostname", ko: "로컬 네트워크 호스트명" } },
    { key: "ip", label: "IP", source: "manual", hint: { en: "Primary IP on the LAN", ko: "LAN 상의 주 IP" } },
    { key: "vendor", label: "vendor", source: "manual", hint: { en: "Hardware vendor or platform", ko: "하드웨어 벤더 / 플랫폼" } },
    // host-axis identity + metrics. source: "system" = host-axis adapter
    // (ssh/snmp/agent), not yet implemented — fields stay (auto) until that
    // adapter lands. Deliberately NOT sourced from "proxmox" — proxmox is a
    // software, and host info must survive swapping software in and out.
    { key: "os", label: "OS", source: "system", hint: { en: "Operating system distribution", ko: "운영체제 배포판" } },
    { key: "kernel", label: "kernel", source: "system", hint: { en: "Running kernel version", ko: "실행 중인 커널 버전" } },
    { key: "uptime", label: "uptime", source: "system", hint: { en: "Time since last boot", ko: "마지막 부팅 이후 경과 시간" } },
    { widget: "gauges", header: "nd.widget.resources", source: "system", metrics: ["cpu", "mem", "disk"] },
  ],
  vm: [
    { key: "role", label: "role", source: "manual", hint: { en: "What this VM does (e.g. k8s node, db)", ko: "이 VM의 역할 (예: k8s 노드, DB)" } },
    { key: "vmId", label: "VMID", source: "manual", hint: { en: "Proxmox VM ID", ko: "Proxmox VM ID" } },
    { key: "ip", label: "IP", source: "manual", hint: { en: "Primary IP on the LAN", ko: "LAN 상의 주 IP" } },
    { key: "k8s_version", label: "k8s version", source: "manual", hint: { en: "Kubernetes version on this VM", ko: "이 VM의 쿠버네티스 버전" } },
    { key: "pool", label: "pool", source: "manual", hint: { en: "Proxmox resource pool", ko: "Proxmox 리소스 풀" } },
    // host-axis (system adapter) auto-fills os/kernel/uptime/mem/disk/cpu from
    // a node_exporter running INSIDE the guest. vcpu/mac/guest_os live on the
    // same axis (any host-axis adapter can supply them) but the current
    // node_exporter mapping doesn't extract them yet — those fields stay
    // (auto) until the system adapter is extended.
    { key: "os", label: "OS", source: "system", hint: { en: "Guest operating system", ko: "게스트 운영체제" } },
    { key: "kernel", label: "kernel", source: "system", hint: { en: "Guest kernel version", ko: "게스트 커널 버전" } },
    { key: "guest_os", label: "guest OS", source: "system", hint: { en: "Guest OS reported by the host", ko: "호스트가 보고한 게스트 OS" } },
    { key: "vcpu", label: "vCPU", source: "system", hint: { en: "Allocated vCPU count", ko: "할당된 vCPU 수" } },
    { key: "uptime", label: "uptime", source: "system", hint: { en: "Time since last boot", ko: "마지막 부팅 이후 경과 시간" } },
    { key: "mac", label: "MAC", source: "system", hint: { en: "Primary NIC MAC address", ko: "주 NIC의 MAC 주소" } },
    { widget: "gauges", header: "nd.widget.resources", source: "system", metrics: ["cpu", "mem", "disk"] },
  ],
  container: [
    { key: "role", label: "role", source: "manual", hint: { en: "What this container does", ko: "이 컨테이너의 역할" } },
    { key: "ctId", label: "CTID", source: "manual", hint: { en: "Proxmox container ID", ko: "Proxmox 컨테이너 ID" } },
    { key: "ip", label: "IP", source: "manual", hint: { en: "Primary IP on the LAN", ko: "LAN 상의 주 IP" } },
    { key: "port", label: "port", source: "manual", hint: { en: "Primary service port", ko: "주 서비스 포트" } },
    { key: "os", label: "OS", source: "system", hint: { en: "Container OS template", ko: "컨테이너 OS 템플릿" } },
    { key: "kernel", label: "kernel", source: "system", hint: { en: "Shared host kernel", ko: "공유 호스트 커널" } },
    { key: "vcpu", label: "vCPU", source: "system", hint: { en: "Allocated vCPU count", ko: "할당된 vCPU 수" } },
    { key: "uptime", label: "uptime", source: "system", hint: { en: "Time since last boot", ko: "마지막 부팅 이후 경과 시간" } },
    { widget: "gauges", header: "nd.widget.resources", source: "system", metrics: ["cpu", "mem", "disk"] },
  ],
  k8s_namespace: [
    { key: "apps", label: "apps", source: "k8s", hint: { en: "Applications deployed here", ko: "이곳에 배포된 애플리케이션" } },
    { key: "certs", label: "certs", source: "k8s", hint: { en: "TLS certificates in this namespace", ko: "이 네임스페이스의 TLS 인증서" } },
    { key: "lb_ip", label: "LB IP", source: "k8s", hint: { en: "Ingress LoadBalancer external IP", ko: "Ingress LoadBalancer 외부 IP" } },
    { widget: "countGrid", header: "nd.widget.workloads", source: "k8s" },
    { widget: "gauges", header: "nd.widget.requests", source: "prom", metrics: ["cpu_req", "mem_req"] },
    { widget: "workloadList", header: "nd.widget.pods", source: "k8s" },
  ],
  router: [
    { key: "vendor", label: "vendor", source: "manual", hint: { en: "Router vendor (e.g. Ubiquiti)", ko: "라우터 벤더 (예: Ubiquiti)" } },
    { key: "model", label: "model", source: "manual", hint: { en: "Router model", ko: "라우터 모델" } },
    { key: "ip", label: "IP", source: "manual", hint: { en: "Router LAN IP", ko: "라우터 LAN IP" } },
    { key: "lanCidr", label: "LAN CIDR", source: "manual", hint: { en: "LAN subnet in CIDR notation", ko: "LAN 서브넷 (CIDR 표기)" } },
    { key: "features", label: "features", source: "manual", hint: { en: "Notable features (VLAN, VPN, etc.)", ko: "주요 기능 (VLAN, VPN 등)" } },
    { key: "version", label: "firmware", source: "manual", hint: { en: "Firmware version", ko: "펌웨어 버전" } },
    { key: "wan_ip", label: "WAN IP", source: "manual", hint: { en: "WAN-side public IP", ko: "WAN 측 공인 IP" } },
    { key: "uptime", label: "uptime", source: "router", hint: { en: "Time since last boot", ko: "마지막 부팅 이후 경과 시간" } },
  ],
  k8s_cluster: [
    { key: "distribution", label: "distribution", source: "manual", hint: { en: "Kubernetes distribution (e.g. kubeadm)", ko: "쿠버네티스 배포판 (예: kubeadm)" } },
    { key: "cni", label: "CNI", source: "manual", hint: { en: "CNI plugin (e.g. Calico, Cilium)", ko: "CNI 플러그인 (예: Calico, Cilium)" } },
    { key: "podCidr", label: "pod CIDR", source: "manual", hint: { en: "Pod network CIDR", ko: "Pod 네트워크 CIDR" } },
    { key: "serviceCidr", label: "service CIDR", source: "manual", hint: { en: "Service network CIDR", ko: "Service 네트워크 CIDR" } },
    { key: "version", label: "version", source: "k8s", hint: { en: "Cluster Kubernetes version", ko: "클러스터 쿠버네티스 버전" } },
    { key: "nodes", label: "nodes", source: "k8s", hint: { en: "Number of nodes in the cluster", ko: "클러스터 노드 수" } },
    { widget: "countGrid", header: "nd.widget.workloads", source: "k8s" },
  ],
  k8s_service: [
    { key: "svc_type", label: "type", source: "k8s", hint: { en: "Service type (ClusterIP, LoadBalancer)", ko: "서비스 타입 (ClusterIP, LoadBalancer)" } },
    { key: "clusterIP", label: "cluster IP", source: "k8s", hint: { en: "In-cluster virtual IP", ko: "클러스터 내부 가상 IP" } },
    { key: "ports", label: "ports", source: "k8s", hint: { en: "Exposed ports and protocols", ko: "노출 포트 및 프로토콜" } },
    { key: "selector", label: "selector", source: "k8s", hint: { en: "Pod selector labels", ko: "Pod selector 레이블" } },
    { key: "endpoints", label: "endpoints", source: "k8s", hint: { en: "Backing pod endpoints", ko: "백엔드 Pod 엔드포인트" } },
  ],
  k8s_pvc: [
    { key: "storageClass", label: "storage class", source: "k8s", hint: { en: "StorageClass providing the volume", ko: "볼륨을 제공하는 StorageClass" } },
    { key: "capacity", label: "capacity", source: "k8s", hint: { en: "Requested storage size", ko: "요청한 스토리지 크기" } },
    { key: "accessMode", label: "access mode", source: "k8s", hint: { en: "Access mode (RWO, RWX)", ko: "접근 모드 (RWO, RWX)" } },
    { key: "volumeName", label: "volume", source: "k8s", hint: { en: "Bound PersistentVolume name", ko: "바인딩된 PersistentVolume 이름" } },
    { key: "phase", label: "phase", source: "k8s", hint: { en: "PVC lifecycle phase", ko: "PVC 라이프사이클 단계" } },
    { widget: "gauges", header: "nd.widget.requests", source: "prom", metrics: ["disk"] },
  ],
  share: [
    { key: "protocol", label: "protocol", source: "manual", hint: { en: "Share protocol (NFS, SMB)", ko: "공유 프로토콜 (NFS, SMB)" } },
    { key: "size", label: "size", source: "manual", hint: { en: "Total share capacity", ko: "전체 공유 용량" } },
    { key: "export", label: "export", source: "manual", hint: { en: "Export path on the server", ko: "서버상의 export 경로" } },
    { key: "path", label: "path", source: "manual", hint: { en: "Mount path on clients", ko: "클라이언트 마운트 경로" } },
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
  // Probe types the operator may pick for this software in the monitoring
  // dropdown. Restricts ProbeControl's options to transports that make sense
  // for the card — e.g. proxmox-ve allows proxmox/tcp/http but not k8s or
  // system; postgresql allows only tcp (a TCP-port check is the right alive
  // signal). Omitted = all PROBE_TYPES allowed (no restriction).
  allowedProbeTypes?: string[];
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
    allowedProbeTypes: ["proxmox", "tcp", "http"],
    entries: [
      { key: "pveVersion", label: "Proxmox version", source: "proxmox", hint: { en: "Proxmox VE version", ko: "Proxmox VE 버전" } },
      { key: "vmCount", label: "VMs", source: "proxmox", hint: { en: "Number of VMs managed", ko: "관리 중인 VM 수" } },
      { key: "ctCount", label: "CTs", source: "proxmox", hint: { en: "Number of LXC containers", ko: "LXC 컨테이너 수" } },
    ],
  },
  postgresql: {
    name: "PostgreSQL",
    category: "Database",
    description: "Relational database server.",
    appliesTo: COMPUTE,
    probe: "tcp",
    allowedProbeTypes: ["tcp"],
    entries: [
      { key: "pgVersion", label: "version", source: "manual", hint: { en: "PostgreSQL version", ko: "PostgreSQL 버전" } },
      { key: "dbSize", label: "DB size", source: "prom", hint: { en: "Total database size", ko: "전체 데이터베이스 크기" } },
      { key: "connections", label: "connections", source: "prom", hint: { en: "Active client connections", ko: "활성 클라이언트 연결 수" } },
    ],
  },
  jellyfin: {
    name: "Jellyfin",
    category: "Media",
    description: "Self-hosted media server for movies, TV, and music.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "jellyfinVersion", label: "version", source: "manual", hint: { en: "Jellyfin server version", ko: "Jellyfin 서버 버전" } },
      { key: "activeStreams", label: "active streams", source: "prom", hint: { en: "Currently streaming sessions", ko: "현재 스트리밍 세션 수" } },
    ],
  },
  adguard: {
    name: "AdGuard Home",
    category: "Network",
    description: "Network-wide DNS ad and tracker blocker.",
    appliesTo: COMPUTE,
    probe: "tcp",
    allowedProbeTypes: ["tcp", "http"],
    entries: [
      { key: "adguardVersion", label: "version", source: "manual", hint: { en: "AdGuard Home version", ko: "AdGuard Home 버전" } },
      { key: "dnsQueries", label: "DNS queries (24h)", source: "prom", hint: { en: "DNS queries served in last 24h", ko: "최근 24시간 DNS 쿼리 수" } },
      { key: "blockedPct", label: "blocked %", source: "prom", hint: { en: "Percent of queries blocked", ko: "차단된 쿼리 비율" } },
    ],
  },
  traefik: {
    name: "Traefik",
    category: "Network",
    description: "Cloud-native reverse proxy and ingress controller.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "traefikVersion", label: "version", source: "manual", hint: { en: "Traefik version", ko: "Traefik 버전" } },
      { key: "routers", label: "routers", source: "manual", hint: { en: "Number of configured routers", ko: "구성된 라우터 수" } },
      { key: "services", label: "services", source: "manual", hint: { en: "Number of backend services", ko: "백엔드 서비스 수" } },
    ],
  },
  nginx: {
    name: "nginx",
    category: "Network",
    description: "HTTP server and reverse proxy.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "nginxVersion", label: "version", source: "manual", hint: { en: "nginx version", ko: "nginx 버전" } },
      { key: "workers", label: "workers", source: "manual", hint: { en: "Worker processes", ko: "워커 프로세스 수" } },
    ],
  },
  grafana: {
    name: "Grafana",
    category: "Monitoring",
    description: "Observability and analytics dashboards.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "grafanaVersion", label: "version", source: "manual", hint: { en: "Grafana version", ko: "Grafana 버전" } },
      { key: "dashboards", label: "dashboards", source: "manual", hint: { en: "Number of dashboards", ko: "대시보드 수" } },
      { key: "datasources", label: "datasources", source: "manual", hint: { en: "Number of data sources", ko: "데이터 소스 수" } },
    ],
  },
  prometheus: {
    name: "Prometheus",
    category: "Monitoring",
    description: "Metrics collection and time-series database.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "promVersion", label: "version", source: "manual", hint: { en: "Prometheus version", ko: "Prometheus 버전" } },
      { key: "retention", label: "retention", source: "manual", hint: { en: "Metric retention period", ko: "메트릭 보존 기간" } },
      { key: "targets", label: "targets", source: "manual", hint: { en: "Scrape targets count", ko: "스크레이프 타겟 수" } },
    ],
  },
  argocd: {
    name: "Argo CD",
    category: "DevOps",
    description: "Declarative GitOps continuous delivery for Kubernetes.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "argoVersion", label: "version", source: "manual", hint: { en: "Argo CD version", ko: "Argo CD 버전" } },
      { key: "apps", label: "applications", source: "manual", hint: { en: "Managed applications", ko: "관리 중인 애플리케이션 수" } },
    ],
  },
  docker: {
    name: "Docker",
    category: "DevOps",
    description: "Container runtime and daemon.",
    appliesTo: ["host", "vm"],
    probe: "tcp",
    allowedProbeTypes: ["tcp", "http"],
    entries: [
      { key: "dockerVersion", label: "version", source: "manual", hint: { en: "Docker engine version", ko: "Docker 엔진 버전" } },
      { key: "containers", label: "containers", source: "manual", hint: { en: "Running containers", ko: "실행 중인 컨테이너 수" } },
      { key: "images", label: "images", source: "manual", hint: { en: "Local images count", ko: "로컬 이미지 수" } },
    ],
  },
  redis: {
    name: "Redis",
    category: "Database",
    description: "In-memory key-value data store.",
    appliesTo: COMPUTE,
    probe: "tcp",
    allowedProbeTypes: ["tcp"],
    entries: [
      { key: "redisVersion", label: "version", source: "manual", hint: { en: "Redis version", ko: "Redis 버전" } },
      { key: "memoryUsed", label: "memory used", source: "manual", hint: { en: "Memory in use", ko: "사용 중인 메모리" } },
      { key: "clients", label: "clients", source: "manual", hint: { en: "Connected clients", ko: "연결된 클라이언트 수" } },
    ],
  },
  nextcloud: {
    name: "Nextcloud",
    category: "App",
    description: "Self-hosted file sync and collaboration.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "nextcloudVersion", label: "version", source: "manual", hint: { en: "Nextcloud version", ko: "Nextcloud 버전" } },
      { key: "users", label: "users", source: "manual", hint: { en: "Registered users", ko: "등록된 사용자 수" } },
      { key: "storageUsed", label: "storage used", source: "manual", hint: { en: "Storage in use", ko: "사용 중인 스토리지" } },
    ],
  },
  homeassistant: {
    name: "Home Assistant",
    category: "App",
    description: "Open-source home automation platform.",
    appliesTo: COMPUTE,
    probe: "http",
    allowedProbeTypes: ["http", "tcp"],
    entries: [
      { key: "haVersion", label: "version", source: "manual", hint: { en: "Home Assistant version", ko: "Home Assistant 버전" } },
      { key: "integrations", label: "integrations", source: "manual", hint: { en: "Active integrations", ko: "활성 통합 수" } },
      { key: "devices", label: "devices", source: "manual", hint: { en: "Connected devices", ko: "연결된 기기 수" } },
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
// allowed probe types for the monitoring dropdown, one-line description for the
// gallery card). Entries live in TYPE_DETAIL above; kept here so that literal
// isn't churned.
//
// allowedProbeTypes restricts ProbeControl's dropdown to transports that make
// sense for the card. Examples:
//   - host/vm/container: system (host-axis adapter) + tcp/http as alternatives
//     for an alive check. proxmox is NOT here — proxmox API talks per-PVE-node,
//     belongs to the proxmox-ve software card, not the bare host.
//   - router: tcp/http only — no host-axis adapter expected, no k8s/proxmox.
//   - k8s_namespace / k8s_pvc: k8s only — these only have meaning via the k8s
//     adapter's namespace/pvc queries; tcp/http on a namespace abstraction
//     doesn't reach anything.
//   - k8s_cluster / k8s_service: k8s + tcp/http (the latter for control-plane
//     or service-IP alive checks).
// Omitted = all PROBE_TYPES allowed (no restriction).
export const INFRA_META: Record<string, { name: string; category: string; probe: string; description: string; allowedProbeTypes?: string[] }> = {
  router:        { name: "Router",        category: "Network",    probe: "tcp",    allowedProbeTypes: ["tcp", "http"],            description: "Network gateway connecting your LAN to the internet." },
  host:          { name: "Host",          category: "Compute",    probe: "system", allowedProbeTypes: ["system", "tcp", "http"],  description: "Physical or bare-metal machine." },
  vm:            { name: "VM",            category: "Compute",    probe: "system", allowedProbeTypes: ["system", "tcp", "http"],  description: "Virtual machine running on a hypervisor." },
  container:     { name: "Container",     category: "Compute",    probe: "system", allowedProbeTypes: ["system", "tcp", "http"],  description: "Lightweight OS-level container (e.g. LXC)." },
  k8s_cluster:   { name: "K8s Cluster",   category: "Kubernetes", probe: "k8s",    allowedProbeTypes: ["k8s", "tcp", "http"],     description: "A Kubernetes cluster." },
  k8s_namespace: { name: "K8s Namespace", category: "Kubernetes", probe: "k8s",    allowedProbeTypes: ["k8s"],                    description: "A namespace grouping workloads within a cluster." },
  k8s_service:   { name: "K8s Service",   category: "Kubernetes", probe: "k8s",    allowedProbeTypes: ["k8s", "tcp", "http"],     description: "A service exposing pods within a cluster." },
  k8s_pvc:       { name: "K8s PVC",       category: "Kubernetes", probe: "k8s",    allowedProbeTypes: ["k8s"],                    description: "A persistent volume claim for stateful storage." },
  share:         { name: "Share",         category: "Storage",    probe: "tcp",    allowedProbeTypes: ["tcp"],                    description: "A network file share (NFS, SMB)." },
};

// Every probe type that the backend collector + buildProbe support. Used as
// the fallback when a card hasn't declared an allowedProbeTypes restriction,
// and as the universe of options the dropdown can possibly offer.
export const PROBE_TYPES = ["tcp", "http", "k8s", "proxmox", "system"];

// Probe types ProbeControl should offer for a given aspect (infra card or
// software id). Falls back to PROBE_TYPES when a card hasn't declared a
// restriction. The caller (ProbeControl) is responsible for keeping a
// saved-but-out-of-list type visible so legacy probes can still be edited.
export function allowedProbeTypesFor(node: any, aspect: string): string[] {
  if (aspect === "infra") {
    return INFRA_META[node?.type]?.allowedProbeTypes ?? PROBE_TYPES;
  }
  return SOFTWARE[aspect]?.allowedProbeTypes ?? PROBE_TYPES;
}

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
