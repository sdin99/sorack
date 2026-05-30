// @ts-nocheck — Phase 1 마이그.

// topology.jsx — interactive topology graph with zoom/pan/drilldown.
// Renders `rootId` + its direct children in the chosen layout.

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { NodeIcon } from "@/components/icons/NodeIcon";
import { STATUS } from "@/lib/data";
import { useSorack } from "@/lib/data-source/SorackData";

// ─── layout calculators ─────────────────────────────────────────────
// Each returns { [id]: {x, y} } in a 1400 × 820 logical canvas.
function layoutTree(rootId, kids) {
  const W = 1400, rootY = 130, childY = 580;
  const positions = { [rootId]: { x: W / 2, y: rootY } };
  const n = kids.length;
  if (n === 0) return positions;
  if (n === 1) {
    positions[kids[0].id] = { x: W / 2, y: childY };
    return positions;
  }
  const spread = Math.min(W - 240, Math.max(560, n * 220));
  const startX = (W - spread) / 2;
  kids.forEach((k, i) => {
    positions[k.id] = { x: startX + (spread / (n - 1)) * i, y: childY };
  });
  return positions;
}
function layoutRadial(rootId, kids) {
  const cx = 700, cy = 410, r = 280;
  const positions = { [rootId]: { x: cx, y: cy } };
  const n = kids.length;
  if (n === 0) return positions;
  const startAngle = -Math.PI / 2;
  kids.forEach((k, i) => {
    const a = startAngle + (i / n) * Math.PI * 2;
    positions[k.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return positions;
}
function layoutGrid(rootId, kids) {
  const W = 1400, rootY = 140;
  const positions = { [rootId]: { x: W / 2, y: rootY } };
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(kids.length))));
  const colW = 280, rowH = 180;
  const startX = W / 2 - ((cols - 1) * colW) / 2;
  const startY = 360;
  kids.forEach((k, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    positions[k.id] = { x: startX + col * colW, y: startY + row * rowH };
  });
  return positions;
}
function layoutForce(rootId, kids) {
  // Deterministic "organic" placement based on id hash
  const cx = 700, cy = 410;
  const positions = { [rootId]: { x: cx, y: cy } };
  const r = 320;
  kids.forEach((k, i) => {
    let h = 0;
    for (const c of k.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const a = ((h % 1000) / 1000) * Math.PI * 2 + i * 0.4;
    const rad = r * (0.7 + ((h >> 7) % 100) / 333);
    positions[k.id] = { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * 0.7 };
  });
  return positions;
}

const LAYOUTS = { tree: layoutTree, radial: layoutRadial, grid: layoutGrid, force: layoutForce };

const KIND_LABEL = {
  router: 'NET', host: 'HOST', vm: 'VM', ct: 'CT',
  ns: 'NS', svc: 'SVC', pvc: 'PVC', share: 'SHARE',
};
const STATUS_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)' };

// SVG-embedded icon helper (uses foreignObject so it inherits CSS color)
function IconInSvg({ kind, x, y, size = 18, color = 'var(--fg-2)' }) {
  return (
    <foreignObject x={x} y={y} width={size} height={size}>
      <div style={{ width: size, height: size, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <NodeIcon kind={kind} size={size} />
      </div>
    </foreignObject>
  );
}

// ─── node renderer ──────────────────────────────────────────────────
function NodeShape({ node, pos, isRoot, isSelected, shape, density, onClick, onDoubleClick }) {
  const hasKids = (node.children || []).length > 0;
  const sizeMul = density === 'compact' ? 0.78 : density === 'comfy' ? 1.1 : 1.0;
  const statusFill = STATUS_COLOR[node.status] || 'var(--ok)';
  const kindLabel = KIND_LABEL[node.kind] || node.kind?.toUpperCase();

  const handlers = {
    onClick: (e) => { e.stopPropagation(); onClick(node.id); },
    onDoubleClick: (e) => { e.stopPropagation(); if (hasKids) onDoubleClick(node.id); },
    style: { cursor: hasKids ? 'pointer' : 'default' },
  };

  if (shape === 'circle') {
    const r = (isRoot ? 50 : 40) * sizeMul;
    const iconSize = isRoot ? 26 : 22;
    return (
      <g transform={`translate(${pos.x},${pos.y})`} {...handlers} className={`tnode ${isSelected ? 'sel' : ''}`}>
        <circle r={r + 8} fill="none" stroke={isSelected ? 'var(--accent)' : 'transparent'} strokeWidth="1.5" />
        <circle r={r} fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" />
        <circle r={r} fill="none" stroke={statusFill} strokeWidth="2" strokeOpacity={node.status === 'ok' ? 0.35 : 0.85} />
        <IconInSvg kind={node.kind} x={-iconSize / 2} y={-iconSize / 2 - 4} size={iconSize} color="var(--fg-1)" />
        <text textAnchor="middle" dy={iconSize / 2 + 8} fontFamily="var(--sans)" fontSize={isRoot ? 15 : 13} fill="var(--fg-1)" fontWeight="600">{node.name}</text>
        <circle cx={r * 0.72} cy={-r * 0.72} r="5" fill={statusFill} />
        <text textAnchor="middle" y={r + 22} fontFamily="var(--mono)" fontSize="10.5" fill="var(--fg-3)">{node.subtitle}</text>
        {hasKids && <text textAnchor="middle" y={r + 38} fontFamily="var(--mono)" fontSize="10" fill="var(--fg-4)">{`↳ ${node.children.length} inside`}</text>}
      </g>
    );
  }

  if (shape === 'icon-card') {
    const w = (isRoot ? 260 : 220) * sizeMul;
    const h = (isRoot ? 96 : 86) * sizeMul;
    const metric = node.metrics ? Object.entries(node.metrics)[0] : null;
    const iconSize = isRoot ? 26 : 22;
    return (
      <g transform={`translate(${pos.x - w/2},${pos.y - h/2})`} {...handlers} className={`tnode ${isSelected ? 'sel' : ''}`}>
        <rect width={w} height={h} rx="10" fill="var(--surface-2)" stroke={isSelected ? 'var(--accent)' : 'var(--border)'} strokeWidth={isSelected ? 1.5 : 1} />
        <rect x="0" y="0" width="3" height={h} fill={statusFill} />
        <IconInSvg kind={node.kind} x={14} y={14} size={iconSize} color="var(--fg-1)" />
        <text x={14 + iconSize + 10} y="22" fontFamily="var(--mono)" fontSize="10" fill="var(--fg-3)" letterSpacing="0.1em">{kindLabel}</text>
        <text x={14 + iconSize + 10} y="40" fontFamily="var(--sans)" fontSize={isRoot ? 17 : 15} fill="var(--fg-1)" fontWeight="600">{node.name}</text>
        <text x="14" y={h - 14} fontFamily="var(--mono)" fontSize="11" fill="var(--fg-3)">{(node.subtitle || '').slice(0, 32)}</text>
        {metric && (
          <text x={w - 14} y="22" textAnchor="end" fontFamily="var(--mono)" fontSize="11" fill="var(--fg-3)">
            {metric[0]} <tspan fill="var(--fg-1)">{metric[1]}</tspan>
          </text>
        )}
        {hasKids && (
          <text x={w - 14} y={h - 14} textAnchor="end" fontFamily="var(--mono)" fontSize="10" fill="var(--fg-4)">
            ↳ {node.children.length} · dbl-click
          </text>
        )}
        <circle cx={w - 14} cy={h - 32} r="3.5" fill={statusFill} />
      </g>
    );
  }

  // rect (default-card) — minimal, with icon
  const w = (isRoot ? 220 : 200) * sizeMul;
  const h = (isRoot ? 78 : 70) * sizeMul;
  const iconSize = isRoot ? 20 : 18;
  return (
    <g transform={`translate(${pos.x - w/2},${pos.y - h/2})`} {...handlers} className={`tnode ${isSelected ? 'sel' : ''}`}>
      <rect width={w} height={h} rx="6" fill="var(--surface-2)" stroke={isSelected ? 'var(--accent)' : 'var(--border)'} strokeWidth={isSelected ? 1.5 : 1} />
      <IconInSvg kind={node.kind} x={12} y={11} size={iconSize} color="var(--fg-2)" />
      <text x={12 + iconSize + 8} y={11 + iconSize / 2 + 4} fontFamily="var(--mono)" fontSize="10" fill="var(--fg-3)" letterSpacing="0.08em">{kindLabel}</text>
      <circle cx={w - 14} cy="15" r="4" fill={statusFill} />
      <text x="14" y={h - 30} fontFamily="var(--sans)" fontSize={isRoot ? 16 : 14} fill="var(--fg-1)" fontWeight="600">{node.name}</text>
      <text x="14" y={h - 12} fontFamily="var(--mono)" fontSize="11" fill="var(--fg-3)">{(node.subtitle || '').slice(0, 32)}</text>
      {hasKids && <text x={w - 14} y={h - 12} textAnchor="end" fontFamily="var(--mono)" fontSize="10" fill="var(--fg-4)">↳{node.children.length}</text>}
    </g>
  );
}

// ─── edge (parent → child) ──────────────────────────────────────────
function Edge({ from, to, status }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const mx = from.x + dx * 0.5, my = from.y + dy * 0.5;
  // Smooth curve
  const c1x = from.x, c1y = my;
  const c2x = to.x,   c2y = my;
  const d = `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
  return (
    <path d={d} fill="none" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray={status === 'err' ? '4 4' : 'none'} />
  );
}

// ─── main topology ──────────────────────────────────────────────────
export function Topology({ rootId, selectedId, onSelect, onDrillDown, layout, shape, density }) {
  const { NODES, getChildren } = useSorack();
  const root = NODES[rootId];
  const kids = getChildren(rootId);
  const positions = useMemo(() => (LAYOUTS[layout] || layoutTree)(rootId, kids), [rootId, layout, kids.length]);

  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);
  const svgRef = useRef(null);

  // Reset transform when root changes
  useEffect(() => { setTransform({ x: 0, y: 0, k: 1 }); }, [rootId, layout]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => {
      const k = Math.max(0.4, Math.min(2.4, t.k * dir));
      return { ...t, k };
    });
  }, []);

  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, t: transform };
  };
  const onMouseMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setTransform({ ...drag.current.t, x: drag.current.t.x + dx, y: drag.current.t.y + dy });
  };
  const onMouseUp = () => { drag.current = null; };

  const zoomBy = (f) => setTransform(t => ({ ...t, k: Math.max(0.4, Math.min(2.4, t.k * f)) }));
  const reset = () => setTransform({ x: 0, y: 0, k: 1 });

  return (
    <div className="topo-wrap">
      {/* zoom chrome */}
      <div className="topo-chrome">
        <div className="topo-meta">
          <span className="topo-meta-k">scope</span>
          <span className="topo-meta-v">{root.kind}/{root.name}</span>
          <span className="topo-meta-sep">·</span>
          <span className="topo-meta-k">children</span>
          <span className="topo-meta-v">{kids.length}</span>
        </div>
        <div className="topo-zoom">
          <button onClick={() => zoomBy(0.85)} title="zoom out">−</button>
          <span className="topo-zoom-val">{Math.round(transform.k * 100)}%</span>
          <button onClick={() => zoomBy(1.15)} title="zoom in">+</button>
          <button onClick={reset} title="reset" className="topo-reset">⟳</button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="topo-svg"
        viewBox="0 0 1400 820"
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={() => onSelect(null)}
        style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <pattern id="dotgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--dot)" />
          </pattern>
        </defs>
        <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#dotgrid)" />

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {kids.map(k => (
            <Edge key={`e-${k.id}`} from={positions[rootId]} to={positions[k.id]} status={k.status} />
          ))}
          <NodeShape
            node={root}
            pos={positions[rootId]}
            isRoot
            isSelected={selectedId === root.id}
            shape={shape}
            density={density}
            onClick={onSelect}
            onDoubleClick={onDrillDown}
          />
          {kids.map(k => (
            <NodeShape
              key={k.id}
              node={k}
              pos={positions[k.id]}
              isSelected={selectedId === k.id}
              shape={shape}
              density={density}
              onClick={onSelect}
              onDoubleClick={onDrillDown}
            />
          ))}
        </g>
      </svg>

      <div className="topo-hint">
        <span><kbd>Click</kbd> select</span>
        <span><kbd>Dbl-click</kbd> drill in</span>
        <span><kbd>Drag</kbd> pan · <kbd>Wheel</kbd> zoom</span>
      </div>
    </div>
  );
}

