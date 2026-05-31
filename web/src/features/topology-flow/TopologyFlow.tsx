// Phase 3A.2 — design's icon-card silhouette inside React Flow.
// Phase 3B: drag-to-reparent (drop on a node = child of it).
// Phase 3C: dagre keeps the layout automatic, BUT the layout only
// recomputes when the graph *structure* changes (nodes added/removed/
// reparented) — never on a plain name/icon/status edit. That kills the
// "cards jump around when I rename something" feeling while still
// auto-tidying the tree. Positions are not user-owned; a drag is purely
// a reparent gesture and the node snaps back into the dagre layout.
// @ts-nocheck — Phase 3 POC.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  applyNodeChanges,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { useSorack } from "@/lib/data-source/SorackData";
import { siblingSort, appendToSiblings } from "@/lib/sort";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { iconForNode } from "@/lib/icon-map";
import { SorackNode } from "./SorackNode";
import { SorackEdge } from "./SorackEdge";
import { softwareIds } from "@/features/lab/node-detail-schema";

const NODE_W = 200;
const NODE_H = 64;
// Software badges share the kind row inside SorackNode (logos sit next to the
// KIND label), so every node has the same layout height. Uniform height = same
// rank center y in dagre = straight parent→child edges, regardless of whether
// either end runs software. (Previously the badge row sat below the name and
// added height; that made edges bend when one end had software and the other
// didn't.)
const nodeHeight = (_node: any): number => NODE_H;

const nodeTypes = { sorack: SorackNode };
const edgeTypes = { sorack: SorackEdge };

// Phase 3D edge typing. `contains` stays implicit (derived from
// node.parentId) — DB rows of any other type are explicit relationships.
// Style is per-type so the graph reads at a glance: tree edges are quiet,
// depends/mounts/routes stand out.
const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string; strokeWidth: number }> = {
  contains: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
  depends:  { stroke: "var(--accent)",        strokeWidth: 1.5, strokeDasharray: "6 4" },
  mounts:   { stroke: "var(--ok)",            strokeWidth: 1.5, strokeDasharray: "2 4" },
  routes:   { stroke: "var(--warn)",          strokeWidth: 1.5, strokeDasharray: "8 3 2 3" },
};
function styleForEdgeType(type: string) {
  return EDGE_STYLES[type] ?? { stroke: "var(--fg-3)", strokeWidth: 1.5, strokeDasharray: "4 4" };
}

// Pure dagre layout — returns top-left positions keyed by id. `heightOf` gives
// each node's box height (nodes with software badges are taller, so the layout
// reserves room and they don't overlap the node below).
function dagrePositions(
  ids: string[],
  edges: { source: string; target: string }[],
  heightOf: (id: string) => number,
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 96, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of ids) g.setNode(id, { width: NODE_W, height: heightOf(id) });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const id of ids) {
    const p = g.node(id);
    out.set(id, { x: p.x - NODE_W / 2, y: p.y - heightOf(id) / 2 });
  }
  return out;
}

function isInSubtree(descendantId: string, ancestorId: string, NODES: Record<string, any>): boolean {
  let cur = NODES[descendantId];
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? NODES[cur.parentId] : null;
  }
  return false;
}

function collectDescendants(rootId: string, NODES: Record<string, any>): string[] {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const n of Object.values(NODES) as any[]) {
      if (n.parentId === id) { out.push(n.id); stack.push(n.id); }
    }
  }
  return out;
}

interface Props {
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onNodeContextMenu?: (e: React.MouseEvent, nodeId: string) => void;
  onPaneContextMenu?: (e: React.MouseEvent) => void;
  // Phase 3D — drag a handle from one node to another to ask App to
  // open the edge-type picker. App owns the picker so it can use the
  // same ActionMenu / ConfirmDialog as the node menus.
  onConnect?: (conn: { source: string; target: string }, position: { x: number; y: number }) => void;
  onEdgeContextMenu?: (e: React.MouseEvent, edge: { id: string; sourceId: string; targetId: string; type: string }) => void;
  // Predicate from the tag filter (App-level). When true, the node renders
  // faded; edges with at least one dimmed endpoint also fade. Pass undefined
  // (or always-false) to disable dimming entirely.
  isDimmed?: (id: string) => boolean;
  // Multi-select for bulk operations. App owns the set; TopologyFlow reflects
  // it via the `selected` flag on node data and forwards selection-change
  // events back. Cmd/Ctrl+click toggles membership; Cmd+drag opens a
  // rubber-band selection box.
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  // Undo/redo wired into the React Flow Controls bar (the +/−/fit cluster).
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoIcon?: React.ReactNode;
  redoIcon?: React.ReactNode;
}

// ─── Rubber-band selection ────────────────────────────────────────
// Cmd/Ctrl + drag on empty pane draws a marquee; nodes whose bounding box
// intersects the rect get added to the App's selectedIds. We run our own
// mousedown listener in capture phase + stopPropagation so React Flow's
// pan handler never starts (using RF's own selectionOnDrag broke under
// controlled `selected` flags on nodes — see earlier crash).
//
// Lives inside <ReactFlow> so it can call useReactFlow() for the
// screen → flow coord conversion that respects zoom + pan.
function RubberBand({
  onSelect,
  suppressClickRef,
}: {
  onSelect: (added: Set<string>) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
}) {
  const rf = useReactFlow();
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // Any plain mousedown clears the suppress flag so it doesn't linger.
      if (!(e.metaKey || e.ctrlKey)) {
        suppressClickRef.current = false;
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('.react-flow__pane')) {
        suppressClickRef.current = false;
        return;
      }
      // Cmd-down on the pane — start a marquee. preventDefault avoids text
      // selection across the page; stopPropagation keeps React Flow from
      // initiating a pan from this same mousedown.
      e.preventDefault();
      e.stopPropagation();
      startRef.current = { x: e.clientX, y: e.clientY };
      setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
      suppressClickRef.current = true;
    };
    const onMove = (e: MouseEvent) => {
      if (!startRef.current) return;
      const sx = Math.min(e.clientX, startRef.current.x);
      const sy = Math.min(e.clientY, startRef.current.y);
      const w = Math.abs(e.clientX - startRef.current.x);
      const h = Math.abs(e.clientY - startRef.current.y);
      setRect({ x: sx, y: sy, w, h });
    };
    const onUp = (e: MouseEvent) => {
      if (!startRef.current) return;
      const start = startRef.current;
      startRef.current = null;
      setRect(null);
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx < 3 && dy < 3) return; // not a real drag; the click-suppress will swallow the click
      const sx1 = Math.min(start.x, e.clientX);
      const sy1 = Math.min(start.y, e.clientY);
      const sx2 = Math.max(start.x, e.clientX);
      const sy2 = Math.max(start.y, e.clientY);
      const tl = rf.screenToFlowPosition({ x: sx1, y: sy1 });
      const br = rf.screenToFlowPosition({ x: sx2, y: sy2 });
      const added = new Set<string>();
      for (const n of rf.getNodes()) {
        const nx = n.position.x;
        const ny = n.position.y;
        const nw = (n as any).width ?? n.measured?.width ?? 200;
        const nh = (n as any).height ?? n.measured?.height ?? 64;
        // AABB intersection test (rect vs node box).
        if (nx + nw >= tl.x && nx <= br.x && ny + nh >= tl.y && ny <= br.y) {
          added.add(n.id);
        }
      }
      if (added.size > 0) onSelect(added);
    };
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [rf, onSelect, suppressClickRef]);

  if (!rect) return null;
  return createPortal(
    <div
      className="rubber-band"
      style={{
        position: 'fixed',
        left: rect.x, top: rect.y,
        width: rect.w, height: rect.h,
        pointerEvents: 'none',
      }}
    />,
    document.body,
  );
}

export function TopologyFlow({ selectedId = null, onSelect, onNodeContextMenu, onPaneContextMenu, onConnect, onEdgeContextMenu, isDimmed, selectedIds, onSelectedIdsChange, onUndo, onRedo, canUndo, canRedo, undoIcon, redoIcon }: Props = {}) {
  const { NODES, EDGES, loading, updateNode, bulkUpdate } = useSorack();
  const isDesktop = useIsDesktop();
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Shared with RubberBand: the marquee handler sets this true on Cmd+
  // mousedown so the follow-up click event on the pane (if any) is
  // swallowed instead of clearing the selection. Reset by the next plain
  // mousedown.
  const suppressPaneClickRef = useRef<boolean>(false);

  // Layout signature — ONLY the things that affect the dagre layout:
  // which nodes exist and their parent links. Deliberately excludes
  // name / icon / status, so editing those leaves layoutKey unchanged
  // and the cards don't jump around. A reparent / add / delete does
  // change it, and the tree re-tidies — which is the wanted behaviour.
  // EDGES (Phase 3D non-tree edges) don't affect layout — dagre would
  // try to satisfy depends/mounts too and pull the cards around. We
  // overlay them on top of the tree layout instead.
  const layoutKey = useMemo(() => {
    return (Object.values(NODES) as any[])
      // Heights are uniform now (badge row is always reserved), so adding or
      // removing software no longer changes layout — only structure + sibling
      // order does. orderIdx in the key forces dagre to re-lay out when the
      // user drags to reorder in the sidebar (or any other reorder path).
      .map((n) => `${n.id}:${n.parentId ?? ""}:${n.meta?.orderIdx ?? ""}`)
      .sort()
      .join("|");
  }, [NODES]);

  const { nodes: laidNodes, edges: treeEdges } = useMemo(() => {
    // Sort by user-set order (meta.orderIdx) then alphabetical fallback —
    // matches the sidebar tree so siblings appear in the same order in both
    // surfaces. Without this, dagre laid children out in NODES insertion
    // order which varies render to render.
    const all = (Object.values(NODES) as any[]).slice().sort(siblingSort);
    if (all.length === 0) return { nodes: [] as RFNode[], edges: [] as RFEdge[] };

    const rfEdges: RFEdge[] = all
      .filter((n) => n.parentId)
      .map((n) => ({
        id: `e-${n.parentId}-${n.id}`,
        source: n.parentId,
        target: n.id,
        type: "smoothstep",
        data: { sorackType: "contains", source: n.parentId, target: n.id, dbId: null },
        style: styleForEdgeType("contains"),
      }));

    const sourceIds = new Set(rfEdges.map((e) => e.source));
    const targetIds = new Set(rfEdges.map((e) => e.target));

    const dagrePos = dagrePositions(all.map((n) => n.id), rfEdges, (id) => nodeHeight(NODES[id]));

    const rfNodes: RFNode[] = all.map((n) => ({
      id: n.id,
      type: "sorack",
      width: NODE_W,
      height: nodeHeight(n),
      data: {
        name: n.name,
        kind: n.kind ?? n.type,
        status: n.status,
        isRoot: !targetIds.has(n.id),
        isLeaf: !sourceIds.has(n.id),
        iconKind: iconForNode(n),
        software: softwareIds(n),
      },
      position: dagrePos.get(n.id) ?? { x: 0, y: 0 },
    }));

    return { nodes: rfNodes, edges: rfEdges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // DB edges (Phase 3D) layered over the tree. Type != 'contains'; any
  // contains rows are filtered out so the tree edge isn't drawn twice.
  //
  // Selection focus: with a node selected, only the edges touching it are
  // shown at full strength (+ label + animation); the rest fade back so a
  // dense relationship graph stays legible. With nothing selected, all
  // non-tree edges are dimmed and label-less — the tree is the resting
  // view, relationships reveal on demand.
  const dbEdges = useMemo<RFEdge[]>(() => {
    return (EDGES ?? [])
      .filter((e: any) => e.type !== "contains")
      .filter((e: any) => NODES[e.sourceId] && NODES[e.targetId])
      .map((e: any) => {
        const focused = !!selectedId && (e.sourceId === selectedId || e.targetId === selectedId);
        const base = styleForEdgeType(e.type);
        return {
          id: `db-${e.id}`,
          source: e.sourceId,
          target: e.targetId,
          type: "sorack",
          animated: focused && e.type === "depends",
          // Lift the focused line above the node layer so it sits on the
          // same plane as its label (which renders in the elevated label
          // layer). Otherwise the label floats over nodes while the line
          // ducks under them — visually disjoint. Non-focused edges stay
          // under the nodes, dimmed.
          zIndex: focused ? 1000 : 0,
          // Arrowhead at the target so direction reads (A depends-on B,
          // A mounts B, A routes-to B). Dimmed when not focused.
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16, height: 16,
            color: focused ? base.stroke : "var(--fg-4)",
          },
          data: { sorackType: e.type, dbId: e.id, sourceId: e.sourceId, targetId: e.targetId, label: e.type, focused },
          style: { ...base, opacity: focused ? 1 : 0.28, strokeWidth: focused ? base.strokeWidth + 0.5 : base.strokeWidth },
        };
      });
  }, [EDGES, NODES, selectedId]);

  const edges = useMemo(() => [...treeEdges, ...dbEdges], [treeEdges, dbEdges]);

  // While dragging a node, hide ONLY its parent tree edge — the reparent
  // gesture is "find a new parent", so the old parent link trailing the
  // cursor is noise. Everything else stays:
  //   - child tree edges (source === draggingId) move with the subtree,
  //   - relationship edges (depends/mounts/routes) are logical, not
  //     positional, so they follow the node like any other connection.
  // (The earlier `source !== draggingId` filter was the bug that made a
  //  dragged node's child links vanish.)
  const visibleEdges = useMemo(() => {
    const base = draggingId
      ? edges.filter((e) => !((e.data as any)?.sorackType === "contains" && e.target === draggingId))
      : edges;
    if (!isDimmed) return base;
    // Dim edges whose either endpoint is dimmed by the tag filter. Caps the
    // existing per-type opacity (e.g. dbEdges already use 0.28 when not
    // focused) at 0.12 so the filter signal is stronger than the focus signal.
    return base.map((e) => {
      const dim = isDimmed(e.source) || isDimmed(e.target);
      if (!dim) return e;
      const curStyle = (e.style as any) ?? {};
      const curOpacity = typeof curStyle.opacity === "number" ? curStyle.opacity : 1;
      return { ...e, style: { ...curStyle, opacity: Math.min(curOpacity, 0.12) } };
    });
  }, [edges, draggingId, isDimmed]);

  // Local position state (RF v12 controlled nodes need onNodesChange to
  // move visually). Resets only when layoutKey changes — i.e. when a
  // node is added/removed/reparented or a saved position changes, never
  // on a plain name/icon edit.
  const [posNodes, setPosNodes] = useState<RFNode[]>(laidNodes);
  useEffect(() => { setPosNodes(laidNodes); }, [laidNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setPosNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  // Merge live display data (name/status/icon) from NODES on top of the
  // stable positions, so editing those updates the card without moving it.
  const nodes = useMemo(
    () => posNodes.map((n) => {
      const live = NODES[n.id];
      // Node is selected when in App's selectedIds, OR when it's the URL
      // selectedId (kept in sync for the single-select path). React Flow
      // renders the selection ring off this flag.
      const isInBulkSet = selectedIds?.has(n.id) ?? false;
      return {
        ...n,
        selected: isInBulkSet || n.id === selectedId,
        data: {
          ...n.data,
          name: live?.name ?? n.data.name,
          status: live?.status ?? n.data.status,
          kind: live?.kind ?? live?.type ?? n.data.kind,
          iconKind: live ? iconForNode(live) : n.data.iconKind,
          software: live ? softwareIds(live) : n.data.software,
          isDropTarget: n.id === dropTargetId,
          dimmed: isDimmed ? isDimmed(n.id) : false,
          maintenance: !!live?.meta?.maintenance,
        },
      };
    }),
    [posNodes, selectedId, dropTargetId, NODES, isDimmed, selectedIds],
  );

  const findDropTarget = useCallback((dragged: RFNode): string | null => {
    // Dragged node's bounding box. AABB overlap with each candidate target —
    // any overlap counts as "over". This is more forgiving than the prior
    // "center-of-dragged inside target's box" test, which felt biased toward
    // the left because the dragged node's center sat far from the cursor
    // when the user grabbed the right edge of a wide card.
    const dL = dragged.position.x;
    const dR = dL + NODE_W;
    const dT = dragged.position.y;
    const dB = dT + NODE_H;
    const dCx = dL + NODE_W / 2;
    const dCy = dT + NODE_H / 2;
    const groupIds = selectedIds?.has(dragged.id) ? Array.from(selectedIds) : [dragged.id];
    const groupSet = new Set(groupIds);
    // Pick the closest valid candidate (by center distance) to avoid
    // ambiguity when overlapping with several at once.
    let best: { id: string; dist: number } | null = null;
    for (const n of posNodes) {
      if (groupSet.has(n.id)) continue;
      const nL = n.position.x;
      const nR = nL + NODE_W;
      const nT = n.position.y;
      const nB = nT + NODE_H;
      const overlap = dR > nL && dL < nR && dB > nT && dT < nB;
      if (!overlap) continue;
      let cycle = false;
      for (const gid of groupIds) {
        if (isInSubtree(n.id, gid, NODES)) { cycle = true; break; }
      }
      if (cycle) continue;
      const ncx = nL + NODE_W / 2;
      const ncy = nT + NODE_H / 2;
      const dist = (ncx - dCx) ** 2 + (ncy - dCy) ** 2;
      if (!best || dist < best.dist) best = { id: n.id, dist };
    }
    return best?.id ?? null;
  }, [posNodes, NODES, selectedIds]);

  const dragRef = useRef<null | {
    draggedId: string;
    // Group members (selectedIds if the dragged node is in the multi-set;
    // otherwise just [dragged.id]). All reparent on drop.
    groupIds: string[];
    // Every position-affected id — group members + their descendants. Drives
    // the per-frame delta move and the revert-to-original on cancel.
    movedIds: string[];
    initial: Map<string, { x: number; y: number }>;
  }>(null);

  const onNodeDragStart = (_e: any, dragged: RFNode) => {
    // If the dragged node is part of a multi-selection, the whole group
    // moves and reparents together. Otherwise single-node behaviour.
    const groupIds = selectedIds?.has(dragged.id)
      ? Array.from(selectedIds)
      : [dragged.id];
    const moved = new Set<string>(groupIds);
    for (const gid of groupIds) {
      for (const d of collectDescendants(gid, NODES)) moved.add(d);
    }
    const initial = new Map<string, { x: number; y: number }>();
    for (const id of moved) {
      const sn = id === dragged.id ? dragged : posNodes.find((n) => n.id === id);
      if (sn) initial.set(id, { ...sn.position });
    }
    dragRef.current = { draggedId: dragged.id, groupIds, movedIds: Array.from(moved), initial };
    setDraggingId(dragged.id);
  };

  const onNodeDrag = (_e: any, dragged: RFNode) => {
    setDropTargetId(findDropTarget(dragged));
    const st = dragRef.current;
    if (!st) return;
    const start = st.initial.get(st.draggedId);
    if (!start) return;
    const dx = dragged.position.x - start.x;
    const dy = dragged.position.y - start.y;
    const movedSet = new Set(st.movedIds);
    setPosNodes((ns) => ns.map((n) => {
      if (n.id === st.draggedId) return n;
      if (!movedSet.has(n.id)) return n;
      const init = st.initial.get(n.id); if (!init) return n;
      return { ...n, position: { x: init.x + dx, y: init.y + dy } };
    }));
  };

  // Phase 3D — drag-to-connect. RF's onConnect fires when a handle
  // drag ends on another handle; we capture the latest pointer coords
  // separately so the type-picker menu can pop up where the drop
  // happened.
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const onConnectHandler = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    onConnect?.({ source: conn.source, target: conn.target }, lastPointerRef.current);
  }, [onConnect]);

  const onEdgeContextMenuHandler = useCallback((e: React.MouseEvent, edge: RFEdge) => {
    e.preventDefault();
    const d = (edge.data || {}) as any;
    onEdgeContextMenu?.(e, {
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      type: d.sorackType ?? "depends",
    });
  }, [onEdgeContextMenu]);

  const onNodeDragStop = (_e: any, dragged: RFNode) => {
    const target = findDropTarget(dragged);
    setDropTargetId(null);
    setDraggingId(null);
    const st = dragRef.current;
    dragRef.current = null;

    // Group-aware reparent: every group member becomes a child of target
    // (skipping those already parented to target). When target is null /
    // invalid, revert all moved nodes to their original positions. Use
    // bulkUpdate so the whole group lands in one history entry (single ⌘Z
    // reverts the entire drag); falls back to updateNode for single drags
    // where atomic batching adds no value.
    //
    // orderIdx assignment: appended to the END of the target's existing
    // children. Without this, the reparented node would keep its old parent's
    // orderIdx and slot in wherever that number happens to fall in the new
    // siblings — feels random / "reversed" to the user.
    if (target && st) {
      const movingIds = st.groupIds.filter((id) => (NODES[id]?.parentId ?? null) !== target);
      if (movingIds.length > 0) {
        const targetSiblings = (Object.values(NODES) as any[])
          .filter((n: any) => (n.parentId ?? null) === target && !movingIds.includes(n.id));
        const { reflowItems, newOrderIdx } = appendToSiblings(targetSiblings);
        const startIdx = newOrderIdx ?? 1000;
        const items: Array<{ id: string; patch: any }> = [
          ...reflowItems,
          ...movingIds.map((id, i) => ({
            id,
            patch: { parentId: target, meta: { orderIdx: startIdx + i * 1000 } },
          })),
        ];
        if (items.length === 1) {
          updateNode(items[0].id, items[0].patch)
            .catch((err: any) => console.error("reparent failed:", items[0].id, err));
          return;
        }
        bulkUpdate(items).catch((err: any) => console.error("bulk reparent failed:", err));
        return;
      }
    }
    // No structural change → snap everything back to dagre's slot.
    if (st) {
      setPosNodes((ns) => ns.map((n) => {
        const init = st.initial.get(n.id);
        return init ? { ...n, position: init } : n;
      }));
    }
  };

  if (loading && nodes.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--fg-2)", fontFamily: "var(--sans)" }}>
        loading inventory…
      </div>
    );
  }

  return (
    <div
      style={{ width: "100%", height: "100%", background: "var(--bg)" }}
      onPointerMove={(e) => { lastPointerRef.current = { x: e.clientX, y: e.clientY }; }}
    >
      <ReactFlow
        nodes={nodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.1 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        // Take React Flow fully out of the selection-via-keyboard business
        // — our click handlers below do all of it. Defaults included Shift
        // in multiSelectionKeyCode, which left RF reacting to Shift+drag
        // even with selectionOnDrag off. Explicit null = inert.
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        // Selection is fully App-controlled — we don't let React Flow run its
        // built-in select-on-click logic because controlled `selected` flags
        // on nodes were fighting it (plain click was treated as add, not
        // replace). Our handlers compute the new selection deterministically:
        //   - plain click     → replace selection with this one node
        //   - Cmd/Ctrl+click  → toggle node in the multi-set (no URL nav)
        //   - Shift+click     → same as Cmd: toggle in multi-set
        //   - plain pane click → clear everything
        onNodeClick={(e, node) => {
          const modifier = e.metaKey || e.ctrlKey || e.shiftKey;
          if (modifier && onSelectedIdsChange) {
            const next = new Set(selectedIds ?? new Set<string>());
            if (next.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            onSelectedIdsChange(next);
            return;
          }
          onSelect?.(node.id);
          onSelectedIdsChange?.(new Set([node.id]));
        }}
        onPaneClick={() => {
          // Cmd+drag rubber band sets the suppress flag — swallow the click
          // that may follow a small (<3px) movement so it doesn't clear the
          // selection we just made.
          if (suppressPaneClickRef.current) {
            suppressPaneClickRef.current = false;
            return;
          }
          onSelect?.(null);
          onSelectedIdsChange?.(new Set());
        }}
        onNodesChange={onNodesChange}
        onNodeContextMenu={(e, node) => onNodeContextMenu?.(e, node.id)}
        onPaneContextMenu={(e) => onPaneContextMenu?.(e as any)}
        onEdgeContextMenu={onEdgeContextMenuHandler}
        onConnect={onConnectHandler}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        panOnDrag={true}
        nodesDraggable={true}
        zoomOnPinch={true}
      >
        <Background gap={24} size={1} color="var(--dot)" />
        {/* Cmd/Ctrl + drag marquee selection. Renders nothing when idle.
            Adds intersected nodes to the App's selectedIds (Cmd = additive
            modifier, so we merge with the existing set rather than replace). */}
        {onSelectedIdsChange && (
          <RubberBand
            suppressClickRef={suppressPaneClickRef}
            onSelect={(added) => {
              const next = new Set(selectedIds ?? new Set<string>());
              for (const id of added) next.add(id);
              onSelectedIdsChange(next);
            }}
          />
        )}
        <Controls position={isDesktop ? "bottom-left" : "top-left"} showInteractive={false}>
          {(onUndo || onRedo) && (
            <>
              <button className="react-flow__controls-button sorack-ctrl-stroke" onClick={() => onUndo?.()} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">{undoIcon}</button>
              <button className="react-flow__controls-button sorack-ctrl-stroke" onClick={() => onRedo?.()} disabled={!canRedo} title="Redo (⌘⇧Z)" aria-label="Redo">{redoIcon}</button>
            </>
          )}
        </Controls>
        <MiniMap
          pannable
          zoomable
          position={isDesktop ? "bottom-right" : "top-right"}
          style={{
            width: isDesktop ? 160 : 110,
            height: isDesktop ? 110 : 75,
          }}
          nodeStrokeWidth={1}
        />
      </ReactFlow>
    </div>
  );
}
