// The two decisions discovery makes before it touches a database.
//
// Kept apart from discovery.ts because that file imports the db, and
// importing the db pulls in the env check — which means a test that only
// wants to ask "what id does this coordinate produce" would need Postgres
// credentials to find out. A pure decision should be checkable purely.
import type { DiscoveredNode } from "./types.js";

// `/`, `-` and `_` are already legal in node ids, so a coordinate needs no
// escaping and no schema change. Kubernetes names are lowercase DNS labels;
// the namespace leads, which keeps ids grouped by namespace when sorted.
export function coordinateId(c: DiscoveredNode["coordinate"]): string {
  return `${c.namespace}/${c.kind}/${c.name}`;
}

// Does this node's probe point at this coordinate? That is what claiming an
// object means — no separate claim field to keep in sync, and no ordering
// requirement between writing an inventory entry and running discovery.
//
// ‼ Deliberately not a name comparison. An inventory names intents ("the
// thing that backs up the portal"); a coordinate names an object. They
// routinely differ — an entry called `portal-backup` may point at a CronJob
// named `db-backup` — so matching on names would duplicate exactly the nodes
// someone cared enough to describe.
export function probeClaims(
  meta: unknown,
  nodeName: string,
  c: DiscoveredNode["coordinate"],
): boolean {
  const probe = ((meta ?? {}) as Record<string, unknown>).probe as Record<string, unknown> | undefined;
  if (!probe || probe.type !== "k8s") return false;
  // The namespace probe defaults to the node's own name, so a claim has to
  // resolve it the same way the adapter does.
  const ns = typeof probe.namespace === "string" ? probe.namespace : nodeName;
  if (ns !== c.namespace) return false;
  const named = probe[c.kind];
  return typeof named === "string" && named === c.name;
}
