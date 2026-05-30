// Phase 3D — custom edge for non-tree relationships (depends/mounts/routes).
//
// Geometry: attach at the CENTER of whichever node side faces the other
// node, picking the facing sides so a right→left relationship doesn't loop
// out and U-turn. Snapping to side-centers (not arbitrary border points
// like a raw floating edge) keeps every line tidy and aligned, while the
// facing-side choice keeps the path short in any direction. A bezier curve
// (vs the tree's right-angle smoothstep) reads as "relationship" not
// "hierarchy".
//
// Custom (not RF's stock bezier) so the type label renders via
// EdgeLabelRenderer — a layer ABOVE the nodes — instead of an SVG label
// that hides behind a node card the line crosses. Label shows only when the
// edge is "focused" (its source or target is the selected node).
// @ts-nocheck — Phase 3 POC, same scope as the topology components.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, type EdgeProps } from "@xyflow/react";

const FALLBACK_W = 200;
const FALLBACK_H = 64;

// Prefer top/bottom connections whenever one node sits above/below the other.
// The dagre layout (rankdir LR) stacks siblings ~96px apart vertically, so the
// old ~2-node-height threshold (140) left directly-stacked nodes wired
// side-to-side (right→right), which reads wrong. We now go vertical once the
// vertical gap clears ~half a node-height AND isn't dwarfed by the horizontal
// gap — so stacked / near-stacked pairs route top↔bottom, while genuinely
// side-by-side nodes (small dy, large dx) still route left↔right.
const STACK_GAP = 40;
// How much horizontal lead the vertical axis is allowed to give up and still
// win. >1 biases toward vertical for "above but slightly offset" pairs.
const VERTICAL_BIAS = 1.3;

function dims(node) {
  return { w: node.measured?.width ?? FALLBACK_W, h: node.measured?.height ?? FALLBACK_H };
}
function center(node) {
  const { w, h } = dims(node);
  return { x: node.internals.positionAbsolute.x + w / 2, y: node.internals.positionAbsolute.y + h / 2 };
}

// The midpoint of the side of `node` that faces `otherCenter`, plus which
// side that is. Horizontal by default; vertical only when the two nodes are
// genuinely stacked (see STACK_GAP).
function facingSide(node, otherCenter) {
  const { w, h } = dims(node);
  const pos = node.internals.positionAbsolute;
  const cx = pos.x + w / 2;
  const cy = pos.y + h / 2;
  const dx = otherCenter.x - cx;
  const dy = otherCenter.y - cy;
  const goVertical = Math.abs(dy) > STACK_GAP && Math.abs(dy) * VERTICAL_BIAS >= Math.abs(dx);
  if (!goVertical) {
    return dx >= 0
      ? { x: pos.x + w, y: cy, pos: Position.Right }
      : { x: pos.x, y: cy, pos: Position.Left };
  }
  return dy >= 0
    ? { x: cx, y: pos.y + h, pos: Position.Bottom }
    : { x: cx, y: pos.y, pos: Position.Top };
}

export function SorackEdge({ id, source, target, data, style, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const s = facingSide(sourceNode, center(targetNode));
  const tgt = facingSide(targetNode, center(sourceNode));
  const [path, labelX, labelY] = getBezierPath({
    sourceX: s.x, sourceY: s.y, sourcePosition: s.pos,
    targetX: tgt.x, targetY: tgt.y, targetPosition: tgt.pos,
  });

  const d = (data || {}) as { label?: string; focused?: boolean; sorackType?: string };

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {d.focused && d.label && (
        <EdgeLabelRenderer>
          <div
            className={`sorack-edge-label sorack-edge-label--${d.sorackType ?? "default"}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
