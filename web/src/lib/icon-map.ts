// Single source of truth for choosing which NodeIcon kind to render
// for a given node. Both the topology graph and the detail panel use
// this so a custom icon override on a node always shows the same shape
// in both places.

export const ALL_ICON_KINDS = [
  "router",
  "host",
  "vm",
  "ct",
  "ns",
  "svc",
  "pvc",
  "share",
] as const;
export type IconKind = (typeof ALL_ICON_KINDS)[number];

// Free-text type strings → an icon shape. Closest-match for k8s_*
// flavours; unknown types fall back to "svc" (a generic service card).
const TYPE_TO_ICON: Record<string, IconKind> = {
  router: "router",
  host: "host",
  vm: "vm",
  container: "ct",
  ct: "ct",
  k8s_cluster: "host",
  k8s_namespace: "ns",
  ns: "ns",
  k8s_service: "svc",
  svc: "svc",
  k8s_pvc: "pvc",
  pvc: "pvc",
  share: "share",
};

export function iconForType(type?: string): IconKind {
  if (!type) return "svc";
  return TYPE_TO_ICON[type] ?? "svc";
}

// Use the operator's explicit icon choice if they made one, else fall
// back to the type-derived default. `meta.iconKind` is the override
// surface (stored on the node row).
export function iconForNode(node: { type?: string; kind?: string; meta?: any } | null | undefined): IconKind {
  if (!node) return "svc";
  const override = node.meta?.iconKind as IconKind | undefined;
  if (override && (ALL_ICON_KINDS as readonly string[]).includes(override)) return override;
  return iconForType(node.type || node.kind);
}
