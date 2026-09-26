// The reconciler, against a real Postgres.
//
// Not in CI: it needs a database, and the pure half (coordinate ids, who
// claims what) is already covered by test-validate.mjs, which does not.
//
//   POSTGRES_HOST=… POSTGRES_USERNAME=… POSTGRES_PASSWORD=… \
//   POSTGRES_DB=<a scratch database> node scripts/test-discovery.mjs
//
// ‼ Writes nodes. Point it at a database you do not mind losing.
//
// The case that earns its keep is the control group: an inventory entry whose
// name MATCHES the cluster object, next to one whose name does not. If only
// the differing pair were tested, a reconciler that matched on names would
// pass — the matching pair is what proves it matched on coordinates.
//
// The other is `kindsRead`. An earlier version of this file tested it against
// an inventory node, which the reconciler never touches, so "did not mark it
// gone" was true for the wrong reason and the branch was never entered.
process.env.SORACK_AUTH_SECRET ??= "test-only";
process.env.SORACK_HEALTH_ENABLED = "false";
const { db } = await import("../api/dist/db/index.js");
const { nodes } = await import("../api/dist/db/schema.js");
const { runMigrations } = await import("../api/dist/db/migrate.js");
const { reconcileDiscovered, coordinateId } = await import("../api/dist/health/discovery.js");
await runMigrations();

// Start from nothing, every run. The first version seeded two inventory
// nodes unconditionally and died on a unique violation the second time —
// a script that only works on a fresh database is one people stop running.
await db.delete(nodes);

const D = (ns, kind, name, type) => ({ coordinate: { namespace: ns, kind, name }, type, name });
const show = async () => (await db.select().from(nodes)).map(n => ({
  id: n.id, disc: n.meta?.discovered ? (n.meta.discovered.goneAt ? "gone" : "live") : "-" }));

// The inventory, as the infra team has it: one entry whose name MATCHES the
// cluster object, one whose name does NOT. The matching one is the control —
// if it also stays unduplicated, the rule matched on coordinates, not names.
await db.insert(nodes).values([
  { id: "portal-backup", type: "k8s_cronjob", name: "portal backup", status: "unknown",
    meta: { probe: { type: "k8s", namespace: "portal", cronjob: "portal-backup" } } },
  { id: "pace-backup", type: "k8s_cronjob", name: "pace backup", status: "unknown",
    meta: { probe: { type: "k8s", namespace: "pace", cronjob: "db-backup" } } },
]);

console.log("1) first sweep of two namespaces");
let r = await reconcileDiscovered("ns-portal", [
  D("portal","cronjob","portal-backup","k8s_cronjob"), D("portal","service","hydra","k8s_service"),
], ["service","cronjob"]);
console.log("   portal:", JSON.stringify(r));
r = await reconcileDiscovered("ns-pace", [
  D("pace","cronjob","db-backup","k8s_cronjob"), D("pace","service","pace-web","k8s_service"),
], ["service","cronjob"]);
console.log("   pace  :", JSON.stringify(r));
console.log("   nodes :", JSON.stringify(await show()));

console.log("2) same sweep again (idempotent?)");
r = await reconcileDiscovered("ns-portal", [
  D("portal","cronjob","portal-backup","k8s_cronjob"), D("portal","service","hydra","k8s_service"),
], ["service","cronjob"]);
console.log("   portal:", JSON.stringify(r));

console.log("3) the service disappears");
r = await reconcileDiscovered("ns-portal", [D("portal","cronjob","portal-backup","k8s_cronjob")], ["service","cronjob"]);
console.log("   portal:", JSON.stringify(r), "| nodes:", JSON.stringify(await show()));

console.log("4) it comes back");
r = await reconcileDiscovered("ns-portal", [
  D("portal","cronjob","portal-backup","k8s_cronjob"), D("portal","service","hydra","k8s_service"),
], ["service","cronjob"]);
console.log("   portal:", JSON.stringify(r), "| nodes:", JSON.stringify(await show()));

// 5 and 6 need an UNCLAIMED discovered cronjob. Run against an inventory
// node — which the reconciler never touches — "did not mark it gone" is true
// for the wrong reason and the branch is never entered.
console.log("5) setup: a discovered cronjob nobody claims");
r = await reconcileDiscovered("ns-pace", [D("pace","cronjob","renovate","k8s_cronjob")], ["service","cronjob"]);
console.log("   created:", JSON.stringify(r.created), "|", JSON.stringify(await show()));

console.log("6) ‼ a sweep that could NOT read cronjobs must not mark it gone");
r = await reconcileDiscovered("ns-pace", [], ["service"]);
console.log("   gone:", JSON.stringify(r.gone), "|", JSON.stringify(await show()));

console.log("7) a sweep that DID read them, finding none, may");
r = await reconcileDiscovered("ns-pace", [], ["service","cronjob"]);
console.log("   gone:", JSON.stringify(r.gone), "|", JSON.stringify(await show()));

console.log("8) and it returns");
r = await reconcileDiscovered("ns-pace", [D("pace","cronjob","renovate","k8s_cronjob")], ["service","cronjob"]);
console.log("   returned:", JSON.stringify(r.returned), "|", JSON.stringify(await show()));
console.log("9) a discovered node arrives already probed");
const probed = (await db.select().from(nodes)).find(n => n.id === "pace/cronjob/renovate");
console.log("   probe:", JSON.stringify(probed?.meta?.probe), "| probeAttached:", probed?.meta?.discovered?.probeAttached);

console.log("10) a node discovered before probes existed gets one; one whose probe was removed does not");
await db.insert(nodes).values([
  { id: "old/service/legacy", type: "k8s_service", name: "legacy", status: "unknown",
    meta: { discovered: { by: "ns-old", coordinate: { namespace: "old", kind: "service", name: "legacy" } } } },
  { id: "old/service/deliberate", type: "k8s_service", name: "deliberate", status: "unknown",
    meta: { discovered: { by: "ns-old", coordinate: { namespace: "old", kind: "service", name: "deliberate" }, probeAttached: true } } },
]);
r = await reconcileDiscovered("ns-old", [
  D("old","service","legacy","k8s_service"), D("old","service","deliberate","k8s_service"),
], ["service"]);
console.log("   equipped:", JSON.stringify(r.equipped));
for (const id of ["old/service/legacy", "old/service/deliberate"]) {
  const n = (await db.select().from(nodes)).find(x => x.id === id);
  console.log(`   ${id}: probe=${JSON.stringify(n?.meta?.probe ?? null)}`);
}
process.exit(0);
