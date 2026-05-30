// Custom React Flow node — matches the design's icon-card silhouette:
//   ┌────────────────────────────┐
//   │ [icon]  KIND          •    │  <- kind label + status dot
//   │ Name                       │
//   └────────────────────────────┘
// Tokens come from styles.css so any theme (dark-modern/brutal-mono/light-engineer)
// stays consistent.
// @ts-nocheck — Phase 3 POC.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeIcon } from "@/components/icons/NodeIcon";
import { SoftwareIcon, hasSoftwareIcon } from "@/components/icons/SoftwareIcon";
import { SOFTWARE } from "@/features/lab/node-detail-schema";

// Schema `type` → NodeIcon `kind`. New schema types map onto the closest
// existing icon for now; bespoke icons can be added later.
const ICON_KIND: Record<string, string> = {
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

const KIND_LABEL: Record<string, string> = {
  router: "NET",
  host: "HOST",
  vm: "VM",
  container: "CT",
  ct: "CT",
  k8s_cluster: "K8S",
  k8s_namespace: "NS",
  ns: "NS",
  k8s_service: "SVC",
  svc: "SVC",
  k8s_pvc: "PVC",
  pvc: "PVC",
  share: "SHARE",
};

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
  unknown: "var(--fg-3)",
};

const HANDLE_STYLE = {
  width: 8,
  height: 8,
  background: "var(--border-strong)",
  border: "none",
};

export function SorackNode({ data, selected }: NodeProps) {
  const { name, kind, status, isRoot, isLeaf, isDropTarget, iconKind: iconKindOverride, software } = data as {
    name: string;
    kind: string;
    status: string;
    isRoot?: boolean;
    isLeaf?: boolean;
    isDropTarget?: boolean;
    iconKind?: string;
    software?: string[];
  };
  const iconKind = iconKindOverride ?? ICON_KIND[kind] ?? "svc";
  const kindLabel = KIND_LABEL[kind] ?? kind?.toUpperCase() ?? "?";
  const statusColor = STATUS_COLOR[status] ?? STATUS_COLOR.unknown;

  // Drop-target wins visually over selection so the user always sees
  // where the reparent will land.
  const borderColor = isDropTarget
    ? "var(--accent)"
    : selected
    ? "var(--accent)"
    : "var(--border)";
  const shadow = isDropTarget
    ? "0 0 0 3px var(--accent-soft), 0 0 0 6px color-mix(in oklab, var(--accent) 25%, transparent)"
    : selected
    ? "0 0 0 3px var(--accent-soft)"
    : "none";
  const bg = isDropTarget
    ? "color-mix(in oklab, var(--accent) 10%, var(--surface-2))"
    : "var(--surface-2)";

  return (
    <div
      style={{
        width: 200,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius)",
        padding: "10px 12px",
        fontFamily: "var(--sans)",
        boxShadow: shadow,
        position: "relative",
        transition: "background 0.1s, box-shadow 0.1s",
      }}
    >
      {/* status accent stripe on the left */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: statusColor,
          borderTopLeftRadius: "var(--radius)",
          borderBottomLeftRadius: "var(--radius)",
        }}
      />

      {/* Handles are always present on both sides so drag-to-connect
          works between any pair of nodes — parent→child isn't the only
          relationship anymore (Phase 3D adds depends/mounts/routes).
          isRoot/isLeaf only dims the unused handle; it stays draggable. */}
      <Handle type="target" position={Position.Left} style={{ ...HANDLE_STYLE, opacity: isRoot ? 0.25 : 1 }} />
      <Handle type="source" position={Position.Right} style={{ ...HANDLE_STYLE, opacity: isLeaf ? 0.25 : 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "var(--fg-2)", display: "flex" }}>
          <NodeIcon kind={iconKind} size={16} />
        </span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--fg-3)",
            letterSpacing: "0.08em",
          }}
        >
          {kindLabel}
        </span>
        {/* software (axis 2) badges live INLINE with the KIND label so every
            node stays the same height (uniform height = straight parent-child
            edges; see TopologyFlow's nodeHeight). Two-icon cap + "+N" counter
            keeps the row compact regardless of how much software a node runs.
            Native title tooltip carries the full name on hover; ids without a
            logo fall back to the first letter so they're still visible. */}
        {software && software.length > 0 && (
          <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
            {software.slice(0, 2).map((id) => {
              const swName = SOFTWARE[id]?.name || id;
              return (
                <span
                  key={id}
                  title={swName}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 14, height: 14,
                    borderRadius: 2,
                    color: "var(--accent)",
                    background: "color-mix(in oklab, var(--accent) 12%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--accent) 35%, transparent)",
                    flexShrink: 0,
                  }}
                >
                  {hasSoftwareIcon(id) ? (
                    <SoftwareIcon id={id} size={9} />
                  ) : (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 8 }}>
                      {swName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
              );
            })}
            {software.length > 2 && (
              <span
                title={software.slice(2).map((id) => SOFTWARE[id]?.name || id).join(", ")}
                style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--fg-3)", paddingLeft: 1 }}
              >
                +{software.length - 2}
              </span>
            )}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            width: 6,
            height: 6,
            borderRadius: 3,
            background: statusColor,
          }}
        />
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--fg-1)",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </div>
    </div>
  );
}
