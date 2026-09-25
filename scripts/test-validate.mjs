// Validator tests. No test runner on purpose — this is one module with pure
// functions, and adding a framework to check it would be more moving parts
// than the thing under test.
//
// These exist because the validators are the boundary a script hits. A
// script cannot tell "my request is wrong" from "the server broke" unless
// bad input reliably produces a 400 that names the field, and "reliably" is
// only true if something checks.
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

if (failures.length) {
  console.error(`validate: ${failures.length} failure(s), ${pass} passed\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`validate: ${pass} checks passed`);
