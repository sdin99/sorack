// @ts-nocheck — Phase 1 마이그.

// overview.jsx — full structure map. Left → right hierarchy with network context.
// One single view: click a node to open side panel (NO scope switch).

import { useState as useStateOV, useRef as useRefOV, useEffect as useEffectOV, useMemo as useMemoOV, useCallback as useCallbackOV } from "react";
import { NodeIcon } from "@/components/icons/NodeIcon";
import { STATUS } from "@/lib/data";
import { useSorack } from "@/lib/data-source/SorackData";

const OV_STATUS = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)' };

function nodeDims(rank) {
  if (rank === 0) return { w: 224, h: 64 };
  if (rank === 1) return { w: 208, h: 60 };
  if (rank === 2) return { w: 200, h: 58 };
  if (rank === 3) return { w: 188, h: 56 };
  return { w: 180, h: 54 };
}

function computeOverviewLayout(rootId, density) {
  const leafSlot = density === 'compact' ? 64 : density === 'comfy' ? 86 : 74;
  const levelGap = density === 'compact' ? 40 : density === 'comfy' ? 70 : 54;
  const positions = {};
  const subtreeH = {};

  function measure(id) {
    const node = NODES[id]; if (!node) return leafSlot;
    const kids = node.children || [];
    if (kids.length === 0) return (subtreeH[id] = leafSlot);
    let h = 0;
    for (const c of kids) h += measure(c);
    return (subtreeH[id] = Math.max(leafSlot, h));
  }
  measure(rootId);

  function place(id, x, cy, rank) {
    positions[id] = { x, y: cy, rank };
    const node = NODES[id]; if (!node) return;
    const kids = node.children || [];
    if (kids.length === 0) return;
    const total = kids.reduce((s, c) => s + subtreeH[c], 0);
    let cursor = cy - total / 2;
    const pw = nodeDims(rank).w;
    const cw = nodeDims(rank + 1).w;
    const nextX = x + pw / 2 + levelGap + cw / 2;
    for (const cid of kids) {
      const h = subtreeH[cid];
      place(cid, nextX, cursor + h / 2, rank + 1);
      cursor += h;
    }
  }
  place(rootId, 0, 0, 0);
  return { positions };
}

// Cards (rendered with foreignObject for nicer text wrapping & flex layout)
function OverviewNode({ node, pos, isSelected, isCurrentScope, onClick, onDoubleClick }) {
  const { w, h } = nodeDims(pos.rank);
  const hasKids = (node.children || []).length > 0;
  const statusColor = OV_STATUS[node.status] || 'var(--ok)';
  const vlanKey = node.vlan;
  const vlan = vlanKey && VLAN_DEF[vlanKey];
  const isPublic = !!node.public_host;
  const hasTunnel = node.tunnel === 'cloudflare';

  return (
    <g
      transform={`translate(${pos.x - w / 2},${pos.y - h / 2})`}
      className={`ov-node ${isSelected ? 'ov-node--sel' : ''} ${isCurrentScope ? 'ov-node--scope' : ''} ov-node--${vlanKey || 'none'}`}
      style={{ cursor: 'pointer' }}
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      onDoubleClick={(e) => { e.stopPropagation(); if (hasKids) onDoubleClick(node.id); }}
    >
      <rect
        className="ov-card"
        width={w} height={h} rx="5"
        fill="var(--surface-2)"
        stroke={isSelected ? 'var(--accent)' : 'var(--border)'}
        strokeWidth={isSelected ? 1.5 : 1}
      />
      <rect x="0" y="0" width="3" height={h} fill={statusColor} />

      <foreignObject x="10" y="9" width={w - 20} height={h - 16}>
        <div className="ov-card-inner">
          <div className="ov-card-row1">
            <span className="ov-card-icon" style={{ color: 'var(--fg-1)' }}>
              <NodeIcon kind={node.kind} size={14} />
            </span>
            <span className="ov-card-name">{node.name}</span>
            {vlan && (
              <span className={`ov-vlan ov-vlan--${vlanKey}`}>{vlan.label}</span>
            )}
          </div>
          <div className="ov-card-row2">
            <span className="ov-card-kind">{node.kind.toUpperCase()}{hasKids ? ` · ${node.children.length}` : ''}</span>
            {node.ip && <span className="ov-card-ip">{node.ip}</span>}
            {!node.ip && node.public_host && <span className="ov-card-ip ov-card-ip--host">{node.public_host}</span>}
            {hasTunnel && <span className="ov-card-tunnel" title="Cloudflare Tunnel ingress">☁ tunnel</span>}
            {isPublic && <span className="ov-card-public" title={node.public_host}>↗ public</span>}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function OverviewEdge({ fx, fy, tx, ty, dashed, color }) {
  const mx = (fx + tx) / 2;
  return (
    <path
      d={`M ${fx} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx} ${ty}`}
      fill="none"
      stroke={color || 'var(--border-strong)'}
      strokeWidth="1"
      strokeDasharray={dashed ? '4 3' : 'none'}
    />
  );
}

export function OverviewMap({ selectedId, onSelect, density }) {
  const { NODES, getChildren } = useSorack();
  const rootId = 'router-be3600';
  const { positions } = useMemoOV(() => computeOverviewLayout(rootId, density), [rootId, density]);

  // Hierarchical edges
  const hierEdges = [];
  for (const id of Object.keys(positions)) {
    const node = NODES[id]; if (!node) continue;
    const p = positions[id]; const pw = nodeDims(p.rank).w;
    for (const cid of (node.children || [])) {
      const c = positions[cid]; if (!c) continue;
      const cw = nodeDims(c.rank).w;
      hierEdges.push({ key: `${id}->${cid}`, fx: p.x + pw / 2, fy: p.y, tx: c.x - cw / 2, ty: c.y });
    }
  }

  // Tunnel annotation: position above router, dashed line to ingress-nginx
  const routerPos = positions['router-be3600'];
  const ingressPos = positions['ns-ingress-nginx'];
  const tunnelAnchor = routerPos ? { x: routerPos.x - 60, y: routerPos.y - 130 } : null;
  const tunnelW = 200, tunnelH = 58;

  // bounds (incl. node sizes, tunnel annotation, legend)
  const padX = 90, padY = 90;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const id of Object.keys(positions)) {
    const p = positions[id]; const { w, h } = nodeDims(p.rank);
    minX = Math.min(minX, p.x - w / 2); maxX = Math.max(maxX, p.x + w / 2);
    minY = Math.min(minY, p.y - h / 2); maxY = Math.max(maxY, p.y + h / 2);
  }
  if (tunnelAnchor) {
    minX = Math.min(minX, tunnelAnchor.x - tunnelW / 2);
    minY = Math.min(minY, tunnelAnchor.y - tunnelH / 2);
  }
  minX -= padX; maxX += padX; minY -= padY; maxY += padY + 50; // extra at bottom for legend
  const vbW = maxX - minX, vbH = maxY - minY;

  // pan/zoom
  const svgRef = useRefOV(null);
  const [tf, setTf] = useStateOV({ x: 0, y: 0, k: 1 });
  const drag = useRefOV(null);

  const onWheel = useCallbackOV((e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 0.9 : 1.1;
    setTf(t => ({ ...t, k: Math.max(0.3, Math.min(2.6, t.k * dir)) }));
  }, []);
  useEffectOV(() => {
    const el = svgRef.current; if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onMouseDown = (e) => { if (e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY, t: tf }; };
  const onMouseMove = (e) => {
    if (!drag.current) return;
    setTf({ ...drag.current.t, x: drag.current.t.x + (e.clientX - drag.current.x), y: drag.current.t.y + (e.clientY - drag.current.y) });
  };
  const onMouseUp = () => { drag.current = null; };

  const zoomBy = (f) => setTf(t => ({ ...t, k: Math.max(0.3, Math.min(2.6, t.k * f)) }));
  const reset = () => setTf({ x: 0, y: 0, k: 1 });

  return (
    <div className="ov-wrap">
      <div className="ov-chrome">
        <div className="topo-meta">
          <span className="topo-meta-k">view</span><span className="topo-meta-v">full map</span>
          <span className="topo-meta-sep">·</span>
          <span className="topo-meta-k">nodes</span><span className="topo-meta-v">{Object.keys(positions).length}</span>
          <span className="topo-meta-sep">·</span>
          <span className="topo-meta-k">edges</span><span className="topo-meta-v">{hierEdges.length}</span>
        </div>
        <div className="topo-zoom">
          <button onClick={() => zoomBy(0.85)}>−</button>
          <span className="topo-zoom-val">{Math.round(tf.k * 100)}%</span>
          <button onClick={() => zoomBy(1.15)}>+</button>
          <button onClick={reset} className="topo-reset">⟳</button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="topo-svg"
        viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={() => onSelect(null)}
        style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <pattern id="dotgrid-ov" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--dot)" />
          </pattern>
        </defs>
        <rect x={minX - 2000} y={minY - 2000} width={vbW + 4000} height={vbH + 4000} fill="url(#dotgrid-ov)" />

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`} style={{ transformOrigin: '0 0' }}>
          {/* hierarchical edges */}
          {hierEdges.map(e => <OverviewEdge key={e.key} fx={e.fx} fy={e.fy} tx={e.tx} ty={e.ty} />)}

          {/* Cloudflare Tunnel: dashed connector from annotation to ingress-nginx */}
          {tunnelAnchor && ingressPos && (
            <OverviewEdge
              fx={tunnelAnchor.x + tunnelW / 2}
              fy={tunnelAnchor.y}
              tx={ingressPos.x - nodeDims(ingressPos.rank).w / 2}
              ty={ingressPos.y}
              dashed
              color="var(--accent)"
            />
          )}

          {/* nodes */}
          {/* legend moved out of SVG to stay visible regardless of zoom/pan (see below) */}
          {Object.entries(positions).map(([id, pos]) => {
            const node = NODES[id]; if (!node) return null;
            return (
              <OverviewNode
                key={id}
                node={node}
                pos={pos}
                isSelected={selectedId === id}
                onClick={onSelect}
                onDoubleClick={onSelect}
              />
            );
          })}

          {/* Tunnel annotation */}
          {tunnelAnchor && (
            <g
              transform={`translate(${tunnelAnchor.x - tunnelW / 2},${tunnelAnchor.y - tunnelH / 2})`}
              className="ov-tunnel"
              onClick={(e) => { e.stopPropagation(); onSelect('ns-ingress-nginx'); }}
              style={{ cursor: 'pointer' }}
            >
              <rect width={tunnelW} height={tunnelH} rx="5" fill="var(--surface-1)" stroke="var(--accent)" strokeDasharray="4 3" />
              <foreignObject x="10" y="8" width={tunnelW - 20} height={tunnelH - 16}>
                <div className="ov-card-inner ov-tunnel-inner">
                  <div className="ov-card-row1">
                    <span className="ov-card-icon" style={{ color: 'var(--accent)' }}>
                      <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                        <path d="M5 14h8a3.5 3.5 0 0 0 .8-6.9A4.5 4.5 0 0 0 4.4 8.5 3 3 0 0 0 5 14z" />
                      </svg>
                    </span>
                    <span className="ov-card-name" style={{ color: 'var(--accent)' }}>Cloudflare Tunnel</span>
                  </div>
                  <div className="ov-card-row2">
                    <span className="ov-card-kind">EDGE · WAN</span>
                    <span className="ov-card-ip">{Object.keys(PUBLIC_HOST).length} public svc</span>
                  </div>
                </div>
              </foreignObject>
            </g>
          )}

          {/* VLAN legend bottom-left (REMOVED — moved out of SVG) */}
        </g>
      </svg>

      <div className="topo-hint">
        <span><kbd>Click</kbd> select</span>
        <span><kbd>Drag</kbd> pan · <kbd>Wheel</kbd> zoom</span>
      </div>

      <div className="ov-legend-float">
        <span className="ov-legend-k">VLAN</span>
        {Object.entries(VLAN_DEF).map(([k, v]) => (
          <span key={k} className={`ov-legend-chip ov-vlan--${k}`}>
            <span className="ov-legend-dot" />
            {v.label}
          </span>
        ))}
        <span className="ov-legend-sep">·</span>
        <span className="ov-legend-chip ov-legend-chip--accent">
          <span className="ov-legend-dot ov-legend-dot--dashed" />
          cf tunnel
        </span>
      </div>
    </div>
  );
}

