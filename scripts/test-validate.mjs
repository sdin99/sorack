// Validator tests. No test runner on purpose — this is one module with pure
// functions, and adding a framework to check it would be more moving parts
// than the thing under test.
//
// These exist because the validators are the boundary a script hits. A
// script cannot tell "my request is wrong" from "the server broke" unless
// bad input reliably produces a 400 that names the field, and "reliably" is
// only true if something checks.
import { readFileSync } from "node:fs";
import { NODE_TYPES } from "../api/dist/lib/node-types.js";
import { isMonitored, withMonitored } from "../api/dist/lib/monitored.js";
import { coordinateId, probeClaims, probeForCoordinate } from "../api/dist/health/coordinates.js";
import { validateNode, validateEdge, ValidationError } from "../api/dist/lib/validate.js";

let pass = 0;
const failures = [];

const accepts = (name, fn) => {
  try { fn(); pass++; }
  catch (e) { failures.push(`${name}: should have been accepted, got "${e.message}"`); }
};

const rejects = (name, fn, expect) => {
  try { fn(); failures.push(`${name}: should have been rejected`); return; }
  catch (e) {
    if (!(e instanceof ValidationError)) { failures.push(`${name}: threw ${e.name}, not ValidationError`); return; }
    if (expect && !e.message.includes(expect)) { failures.push(`${name}: message was "${e.message}", expected it to contain "${expect}"`); return; }
    pass++;
  }
};

accepts("minimal node", () => validateNode({ id: "k8s-master", type: "host", name: "k8s-master" }));
accepts("full node", () => validateNode({
  id: "ns-app", type: "k8s_namespace", name: "app", parentId: "k8s-cluster",
  status: "ok", meta: { a: 1 }, tags: ["x"], position: { x: 1, y: 2 },
}));
accepts("partial patch", () => validateNode({ name: "renamed" }, { partial: true }));
accepts("null parentId clears it", () => validateNode({ parentId: null }, { partial: true }));
accepts("minimal edge", () => validateEdge({ sourceId: "a", targetId: "b" }));

rejects("missing id", () => validateNode({ type: "host", name: "x" }), "id is required");
rejects("uppercase id", () => validateNode({ id: "K8s", type: "host", name: "x" }), "lowercase");
rejects("id with a space", () => validateNode({ id: "a b", type: "host", name: "x" }), "lowercase");
rejects("blank name", () => validateNode({ id: "a", type: "host", name: "   " }), "must not be empty");
rejects("unknown status", () => validateNode({ id: "a", type: "host", name: "x", status: "green" }), "status must be one of");
rejects("tags not an array", () => validateNode({ id: "a", type: "host", name: "x", tags: "a" }), "array of strings");
rejects("tags holding a number", () => validateNode({ id: "a", type: "host", name: "x", tags: [1] }), "only strings");
rejects("half a position", () => validateNode({ id: "a", type: "host", name: "x", position: { x: 1 } }), "finite numbers");
rejects("meta as an array", () => validateNode({ id: "a", type: "host", name: "x", meta: [] }), "must be an object");
rejects("over-long name", () => validateNode({ id: "a", type: "host", name: "z".repeat(257) }), "256 characters");
rejects("empty patch", () => validateNode({}, { partial: true }), "no known fields");
rejects("null body", () => validateNode(null), "body must be a JSON object");
rejects("array body", () => validateNode([]), "body must be a JSON object");
rejects("self-referencing edge", () => validateEdge({ sourceId: "a", targetId: "a" }), "must differ");
rejects("edge without a source", () => validateEdge({ targetId: "b" }), "sourceId is required");

// The type that started this: the infra sync sent its own vocabulary and 9 of
// 13 nodes landed as something nothing recognises — a fallback icon and an
// empty detail panel, with no error anywhere.
rejects("a type from somebody else's vocabulary",
  () => validateNode({ id: "a", type: "app", name: "x" }), "type must be one of");
rejects("a type that is merely plausible",
  () => validateNode({ id: "a", type: "service", name: "x" }), "type must be one of");
accepts("a short-form type", () => validateNode({ id: "a", type: "svc", name: "x" }));

// ── monitored: derived, and the collector must agree with it ──────────────
// "Nothing is watching this" and "something looked and could not tell" were
// the same grey until now. The test that matters is that this uses the same
// rule the collector uses to choose what to probe — if they drift, a node
// reads as monitored and is never probed, or the reverse.
{
  const cases = [
    ["empty meta", {}, false],
    ["infra probe", { probe: { type: "tcp", host: "h", port: 1 } }, true],
    ["probe with no type", { probe: { host: "h" } }, false],
    ["software probe only", { softwareProbes: { cnpg: { type: "http" } } }, true],
    ["empty software bag", { softwareProbes: {} }, false],
    ["probe: null", { probe: null }, false],
  ];
  for (const [label, meta, want] of cases) {
    const got = isMonitored(meta);
    if (got === want) pass++;
    else failures.push(`monitored: ${label} → ${got}, expected ${want}`);
  }
  const w = withMonitored({ id: "x", meta: { probe: { type: "tcp" } } });
  if (w.monitored === true && w.id === "x") pass++;
  else failures.push("monitored: withMonitored dropped fields or the flag");
}

// ── discovery: coordinates, and who claims them ───────────────────────────
// The reconciler's database half is exercised in scripts/test-discovery.mjs
// (it needs a Postgres). These are the two pure decisions inside it, and both
// were wrong in an earlier draft: ids built from names rather than
// coordinates, and a claim test that compared names.
{
  const cases = [
    [{ namespace: "portal", kind: "cronjob", name: "portal-backup" }, "portal/cronjob/portal-backup"],
    [{ namespace: "pace", kind: "cronjob", name: "db-backup" }, "pace/cronjob/db-backup"],
    [{ namespace: "kube-system", kind: "service", name: "kube-dns" }, "kube-system/service/kube-dns"],
  ];
  for (const [coord, want] of cases) {
    const got = coordinateId(coord);
    if (got !== want) failures.push(`coordinateId: ${JSON.stringify(coord)} → ${got}`);
    // And the result has to be a legal node id, or discovery writes rows the
    // api would reject from anyone else.
    else if (!/^[a-z0-9][a-z0-9/_-]{0,127}$/.test(got)) failures.push(`coordinateId: ${got} is not a valid node id`);
    else pass++;
  }

  // Claiming is by coordinate, not by name. The case that matters is the one
  // where the two differ: an inventory entry called `portal-backup` whose
  // probe points at a CronJob actually named `db-backup`.
  const claims = [
    ["matching names", { probe: { type: "k8s", namespace: "portal", cronjob: "portal-backup" } }, "portal backup",
      { namespace: "portal", kind: "cronjob", name: "portal-backup" }, true],
    ["differing names", { probe: { type: "k8s", namespace: "pace", cronjob: "db-backup" } }, "pace backup",
      { namespace: "pace", kind: "cronjob", name: "db-backup" }, true],
    ["right name, wrong namespace", { probe: { type: "k8s", namespace: "other", cronjob: "db-backup" } }, "x",
      { namespace: "pace", kind: "cronjob", name: "db-backup" }, false],
    ["right name, wrong kind", { probe: { type: "k8s", namespace: "pace", service: "db-backup" } }, "x",
      { namespace: "pace", kind: "cronjob", name: "db-backup" }, false],
    ["namespace probe defaults to the node name", { probe: { type: "k8s" } }, "pace",
      { namespace: "pace", kind: "cronjob", name: "db-backup" }, false],
    ["no probe at all", {}, "x", { namespace: "pace", kind: "cronjob", name: "db-backup" }, false],
  ];
  for (const [label, meta, name, coord, want] of claims) {
    const got = probeClaims(meta, name, coord);
    if (got === want) pass++;
    else failures.push(`probeClaims: ${label} → ${got}, expected ${want}`);
  }

  // A discovered node arrives already watched. The pair that matters is that
  // the probe it gets is one that would claim its own coordinate — otherwise
  // a re-sweep would fail to recognise the node it just made and create a
  // second one beside it.
  for (const [, , , coord] of claims.slice(0, 2)) {
    const probe = probeForCoordinate(coord);
    if (probeClaims({ probe }, "irrelevant", coord)) pass++;
    else failures.push(`probeForCoordinate: ${JSON.stringify(coord)} produced a probe that does not claim it`);
  }
}

// ── the api's type list vs the schemas it claims to describe ──────────────
// api/src/lib/node-types.ts is a copy: the two packages share nothing. A type
// accepted here with no schema in the web package is the exact failure the
// validation was added to prevent, reintroduced from the other side.
{
  const schema = readFileSync(
    new URL("../web/src/features/lab/node-detail-schema.ts", import.meta.url), "utf8");
  const detail = schema.slice(schema.indexOf("export const TYPE_DETAIL"),
                              schema.indexOf("export interface SoftwareTemplate"));
  const canonical = [...detail.matchAll(/^ {2}([a-z0-9_]+):\s*\[/gm)].map((m) => m[1]);
  const aliasBlock = schema.slice(schema.indexOf("export const TYPE_ALIAS"));
  const aliases = [...aliasBlock.slice(0, aliasBlock.indexOf("}")).matchAll(/^ {2}([a-z0-9_]+):/gm)]
    .map((m) => m[1]);

  if (canonical.length === 0 || aliases.length === 0) {
    // Parsed nothing is not the same as found no drift.
    failures.push(`type drift: parsed ${canonical.length} canonical and ${aliases.length} alias types from the web schema — the parse is broken, not the lists`);
  } else {
    const want = [...canonical, ...aliases].sort();
    const have = [...NODE_TYPES].sort();
    const missing = want.filter((t) => !have.includes(t));
    const extra = have.filter((t) => !want.includes(t));
    if (missing.length || extra.length) {
      failures.push(
        `type drift: api NODE_TYPES vs web schemas — ` +
        `${missing.length ? `web has ${missing.join(", ")} and the api rejects them; ` : ""}` +
        `${extra.length ? `the api accepts ${extra.join(", ")} with no detail schema` : ""}`);
    } else {
      pass++;
    }
  }
}

if (failures.length) {
  console.error(`validate: ${failures.length} failure(s), ${pass} passed\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`validate: ${pass} checks passed`);
