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
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  applyNodeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { useSorack } from "@/lib/data-source/SorackData";
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
  // Undo/redo wired into the React Flow Controls bar (the +/−/fit cluster).
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoIcon?: React.ReactNode;
  redoIcon?: React.ReactNode;
}

export function TopologyFlow({ selectedId = null, onSelect, onNodeContextMenu, onPaneContextMenu, onConnect, onEdgeContextMenu, onUndo, onRedo, canUndo, canRedo, undoIcon, redoIcon }: Props = {}) {
  const { NODES, EDGES, loading, updateNode } = useSorack();
  const isDesktop = useIsDesktop();
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

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
      // removing software no longer changes layout — only structure does.
      .map((n) => `${n.id}:${n.parentId ?? ""}`)
      .sort()
      .join("|");
  }, [NODES]);

  const { nodes: laidNodes, edges: treeEdges } = useMemo(() => {
    const all = Object.values(NODES) as any[];
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
    if (!draggingId) return edges;
    return edges.filter((e) => !((e.data as any)?.sorackType === "contains" && e.target === draggingId));
  }, [edges, draggingId]);

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
      return {
        ...n,
        selected: n.id === selectedId,
        data: {
          ...n.data,
          name: live?.name ?? n.data.name,
          status: live?.status ?? n.data.status,
          kind: live?.kind ?? live?.type ?? n.data.kind,
          iconKind: live ? iconForNode(live) : n.data.iconKind,
          software: live ? softwareIds(live) : n.data.software,
          isDropTarget: n.id === dropTargetId,
        },
      };
    }),
    [posNodes, selectedId, dropTargetId, NODES],
  );

  const findDropTarget = useCallback((dragged: RFNode): string | null => {
    const cx = dragged.position.x + NODE_W / 2;
    const cy = dragged.position.y + NODE_H / 2;
    for (const n of posNodes) {
      if (n.id === dragged.id) continue;
      const { x, y } = n.position;
      if (cx >= x && cx <= x + NODE_W && cy >= y && cy <= y + NODE_H) {
        if (isInSubtree(n.id, dragged.id, NODES)) continue;
        return n.id;
      }
    }
    return null;
  }, [posNodes, NODES]);

  const dragRef = useRef<null | {
    draggedId: string;
    descendants: string[];
    initial: Map<string, { x: number; y: number }>;
  }>(null);

  const onNodeDragStart = (_e: any, dragged: RFNode) => {
    const descendants = collectDescendants(dragged.id, NODES);
    const initial = new Map<string, { x: number; y: number }>();
    initial.set(dragged.id, { ...dragged.position });
    for (const id of descendants) {
      const sn = posNodes.find((n) => n.id === id);
      if (sn) initial.set(id, { ...sn.position });
    }
    dragRef.current = { draggedId: dragged.id, descendants, initial };
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
    setPosNodes((ns) => ns.map((n) => {
      if (n.id === st.draggedId) return n;
      if (!st.descendants.includes(n.id)) return n;
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

    const current = NODES[dragged.id]?.parentId ?? null;
    const reparent = !!target && target !== current;

    if (reparent) {
      // Reparent re-tidies the tree (layoutKey changes → dagre re-runs →
      // the node lands in its new slot automatically). No position saved.
      updateNode(dragged.id, { parentId: target })
        .catch((err: any) => console.error("reparent failed:", err));
    } else {
      // Dropped on empty space or back on the current parent — no
      // structural change. Snap the subtree back to its dagre slot so
      // the node doesn't float where it was let go.
      if (st) {
        setPosNodes((ns) => ns.map((n) => {
          const init = st.initial.get(n.id);
          return init ? { ...n, position: init } : n;
        }));
      }
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
        onNodeClick={(_, node) => onSelect?.(node.id)}
        onPaneClick={() => onSelect?.(null)}
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
