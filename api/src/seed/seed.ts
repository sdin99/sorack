// Minimal demo seed — a tiny synthetic infra so the UI has something to
// render before the operator enters real data. All identifiers are sample
// values; replace them through the UI (or wipe + re-seed with your own
// edits to this file). Idempotent for nodes/runbooks (id-keyed); alerts are
// wiped + re-inserted because UUID PK.
//
// meta layout follows the namespace model: user-declared display fields live
// under meta.manual.* (rendered by the per-type detail schema). Collector /
// adapter output (health, metrics, k8s counts) is written at runtime under
// meta.observed.* — never seeded. Root config keys (probe / iconKind /
// softwareProbes / statusPrimary) likewise aren't seeded here.
import { db } from "../db";
import { nodes, runbooks, alerts } from "../db/schema";

const seedNodes = [
  {
    id: "router",
    type: "router",
    name: "Edge Router",
    status: "ok" as const,
    meta: {
      manual: {
        vendor: "Sample Vendor",
        ip: "10.1.1.1",
        lanCidr: "10.1.1.0/24",
      },
    },
  },
  {
    id: "hypervisor",
    type: "host",
    parentId: "router",
    name: "Hypervisor Host",
    status: "ok" as const,
    meta: { manual: { hostname: "hv-01", ip: "10.1.1.10", role: "hypervisor" } },
  },
  {
    id: "nas",
    type: "host",
    parentId: "router",
    name: "Storage NAS",
    status: "ok" as const,
    meta: { manual: { ip: "10.1.1.20", role: "storage" } },
  },
  {
    id: "vm-control-plane",
    type: "vm",
    parentId: "hypervisor",
    name: "control-plane",
    status: "ok" as const,
    meta: { manual: { vmId: 100, ip: "10.1.1.30" } },
  },
  {
    id: "k8s-cluster",
    type: "k8s_cluster",
    parentId: "vm-control-plane",
    name: "K8s Cluster",
    status: "ok" as const,
    meta: {
      manual: {
        cni: "Calico",
        podCidr: "10.244.0.0/16",
        serviceCidr: "10.96.0.0/12",
      },
    },
  },
  { id: "ns-app",        type: "k8s_namespace", parentId: "k8s-cluster", name: "app",        status: "ok" as const, meta: {} },
  { id: "ns-monitoring", type: "k8s_namespace", parentId: "k8s-cluster", name: "monitoring", status: "ok" as const, meta: {} },
];

const seedRunbooks = [
  {
    id: "welcome",
    title: "Welcome to Sorack",
    category: "sop" as const,
    status: "completed" as const,
    markdown:
      "# Welcome\n\nSorack is a homelab control-plane dashboard. This runbook is a placeholder — replace with your own operational notes.\n\nSee the README for self-hosting setup.",
    nodeRefs: ["k8s-cluster"],
  },
];

const seedAlerts = [
  {
    severity: "warn" as const,
    title: "Demo alert — wire your own source",
    detail: "Replace this when you connect a real alert source.",
    nodeId: "k8s-cluster",
    age: "now",
  },
];

async function main() {
  console.log("[seed] inserting nodes…");
  await db.insert(nodes).values(seedNodes).onConflictDoNothing();
  console.log("[seed] inserting runbooks…");
  await db.insert(runbooks).values(seedRunbooks).onConflictDoNothing();
  console.log("[seed] replacing alerts…");
  await db.delete(alerts);
  await db.insert(alerts).values(seedAlerts);
  console.log("[seed] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
