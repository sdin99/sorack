// The vocabulary `type` may take on a node.
//
// It used to be any string of 64 characters or fewer. The infra team's sync
// sent its own words — `app`, `ingress` — and 9 of 13 nodes landed as types
// nothing recognises: a generic icon, and a detail panel with no fields in
// it, because the renderer looks the type up in a table that has no such key.
// Nothing failed. The operator noticed by looking at the screen.
//
// `status` was an enum from the start and `type` was not, which was not a
// decision so much as an omission. A wrong type is worse than a wrong status:
// status is one glyph, type decides the entire detail schema.
//
// ‼ This list is duplicated from web/src/features/lab/node-detail-schema.ts,
// where the schemas actually live — api and web share no package. The copy is
// checked: scripts/test-validate.mjs parses both and fails when they drift.
// Adding a type here without a schema there would restore exactly the silent
// fallback this exists to remove.
export const NODE_TYPES: readonly string[] = [
  "host",
  "vm",
  "container",
  "k8s_namespace",
  "router",
  "k8s_cluster",
  "k8s_service",
  "k8s_pvc",
  "share",
  // short forms, accepted and resolved to the canonical schema
  "ct",
  "ns",
  "pvc",
  "svc",
] as const;
