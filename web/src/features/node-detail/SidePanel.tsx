// @ts-nocheck — Phase 1 마이그.

// sidepanel.jsx — node detail. Now splits spec into "synced (API)" vs "curated (manual)"
// so it's obvious which fields auto-update and which the operator owns.

import * as React from "react";
import { useEffect as useEffectSP, useState as useStateSP } from "react";
import { NodeIcon } from "@/components/icons/NodeIcon";
import { useSorack } from "@/lib/data-source/SorackData";

function StatusPill({ status }) {
  const map = { ok: ['healthy', 'var(--ok)'], warn: ['warning', 'var(--warn)'], err: ['error', 'var(--err)'] };
  const [label, color] = map[status] || map.ok;
  return (
    <span className="status-pill" style={{ '--c': color }}>
      <span className="status-dot" />{label}
    </span>
  );
}

function MetricRow({ k, v }) {
  return (
    <div className="metric">
      <div className="metric-k">{k}</div>
      <div className="metric-v">{v}</div>
    </div>
  );
}

function SpecRow({ k, v, curated, onEdit }) {
  return (
    <div className={`spec ${curated ? 'spec--curated' : 'spec--auto'}`}>
      <div className="spec-k">{k}</div>
      <div className="spec-v">{String(v)}</div>
      <div className="spec-tag">
        {curated
          ? (onEdit && <button className="spec-edit" onClick={onEdit} title="edit">✎</button>)
          : <span className="spec-lock" title="synced from API — read-only">🔒</span>}
      </div>
    </div>
  );
}

function DescriptionEditor({ nodeId, initial }) {
  const [override, setOv] = useStateSP(() => getOverride(nodeId, 'description'));
  const value = override ?? initial ?? '';
  const [editing, setEditing] = useStateSP(false);
  const [draft, setDraft] = useStateSP(value);
  useEffectSP(() => { setOv(getOverride(nodeId, 'description')); setEditing(false); setDraft(getOverride(nodeId, 'description') ?? initial ?? ''); }, [nodeId, initial]);

  const save = () => {
    setOverride(nodeId, 'description', draft);
    setOv(draft); setEditing(false);
  };
  const reset = () => {
    setOverride(nodeId, 'description', null);
    setOv(undefined); setEditing(false); setDraft(initial || '');
  };

  if (editing) {
    return (
      <div className="sp-desc sp-desc--editing">
        <div className="sp-desc-h">
          <span className="sp-desc-label">description</span>
        </div>
        <textarea
          className="sp-desc-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          rows={3}
          placeholder="이 노드에 대한 자유 메모"
        />
        <div className="sp-desc-actions">
          {override !== undefined && <button className="sp-btn sp-btn--ghost" onClick={reset}>reset to default</button>}
          <button className="sp-btn sp-btn--ghost" onClick={() => { setDraft(value); setEditing(false); }}>cancel</button>
          <button className="sp-btn sp-btn--primary" onClick={save}>save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-desc">
      <div className="sp-desc-h">
        <span className="sp-desc-label">description</span>
        {override !== undefined && <span className="sp-edited-mark">edited</span>}
        <button className="sp-edit" onClick={() => setEditing(true)} title="edit">✎ edit</button>
      </div>
      <div className={`sp-desc-body ${!value ? 'sp-desc-body--empty' : ''}`}>
        {value || '아직 작성된 description 이 없어요. 우상단 ✎ edit 로 추가.'}
      </div>
    </div>
  );
}

export function SidePanel({ nodeId, onClose, onJumpNode, onOpenRunbook, position }) {
  const { NODES, getChildren, getPath, VLAN_DEF, DATA_SOURCE, AUTO_SPEC_KEYS, getOverride, setOverride, countAuto, countCurated } = useSorack();
  if (!nodeId) return null;
  const node = NODES[nodeId];
  if (!node) return null;
  const path = getPath(nodeId);
  const children = getChildren(nodeId);

  useEffectSP(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const autoKeys = AUTO_SPEC_KEYS[node.kind] || [];
  const specEntries = Object.entries(node.spec || {});
  const autoSpec = specEntries.filter(([k]) => autoKeys.includes(k));
  const curatedSpec = specEntries.filter(([k]) => !autoKeys.includes(k));

  // Top-level curated bits to surface as rows
  const topCurated = [];
  if (node.subtitle)    topCurated.push(['display name', node.name]);
  if (node.vlan)        topCurated.push(['vlan', VLAN_DEF[node.vlan]?.label || node.vlan]);
  if (node.public_host) topCurated.push(['public host', node.public_host]);
  if (node.tunnel)      topCurated.push(['ingress tunnel', node.tunnel]);

  const src = DATA_SOURCE[node.kind];
  const nAuto = countAuto(node);
  const nCurated = countCurated(node);

  return (
    <aside className={`sidepanel sidepanel--${position}`}>
      <header className="sp-head">
        <div className="sp-crumbs">
          {path.map((n, i) => (
            <React.Fragment key={n.id}>
              {i > 0 && <span className="sp-crumb-sep">/</span>}
              <button className={`sp-crumb ${n.id === nodeId ? 'sp-crumb--cur' : ''}`} onClick={() => onJumpNode(n.id)}>{n.name}</button>
            </React.Fragment>
          ))}
        </div>
        <button className="sp-close" onClick={onClose} aria-label="close">×</button>
      </header>

      <div className="sp-body">
        <div className="sp-title">
          <div className="sp-title-row">
            <span className="sp-icon"><NodeIcon kind={node.kind} size={22} /></span>
            <div className="sp-title-text">
              <div className="sp-kind">{node.kind}</div>
              <h2>{node.name}</h2>
            </div>
          </div>
          <div className="sp-sub">{node.subtitle}</div>
        </div>

        <div className="sp-status-row">
          <StatusPill status={node.status} />
          <span className="sp-id">{node.id}</span>
        </div>

        <div className="sp-prov">
          <span className="sp-prov-chip"><span className="sp-prov-dot sp-prov-dot--auto" />{nAuto} synced</span>
          <span className="sp-prov-chip"><span className="sp-prov-dot sp-prov-dot--curated" />{nCurated} curated</span>
          {src && <span className="sp-prov-age">last sync {src.age}</span>}
        </div>

        {node.warnings && node.warnings.length > 0 && (
          <section className="sp-section sp-warn">
            <div className="sp-section-h"><span>⚠ active issues</span></div>
            {node.warnings.map((w, i) => <div key={i} className="sp-warn-line">{w}</div>)}
          </section>
        )}

        {node.metrics && Object.keys(node.metrics).length > 0 && (
          <section className="sp-section">
            <div className="sp-section-h">
              <span>live metrics</span>
              <span className="sp-section-meta">Prometheus · 15s ago</span>
            </div>
            <div className="metrics-grid">
              {Object.entries(node.metrics).map(([k, v]) => <MetricRow key={k} k={k} v={v} />)}
            </div>
          </section>
        )}

        <section className="sp-section">
          <div className="sp-section-h">
            <span>spec</span>
            {src && <span className="sp-section-meta">{src.name} · {src.age}</span>}
          </div>
          <div className="specs">
            {/* Curated rows first — these are the ones the operator owns */}
            {topCurated.map(([k, v]) => <SpecRow key={'c-' + k} k={k} v={v} curated onEdit={() => {}} />)}
            {curatedSpec.map(([k, v]) => <SpecRow key={'cs-' + k} k={k} v={v} curated onEdit={() => {}} />)}
            {/* Synced rows after, locked */}
            {autoSpec.map(([k, v]) => <SpecRow key={'a-' + k} k={k} v={v} curated={false} />)}
          </div>
        </section>

        {(node.tags || []).length > 0 || true ? (
          <section className="sp-section">
            <div className="sp-section-h">
              <span>notes · tags</span>
              <span className="sp-section-meta">manually maintained</span>
            </div>
            {(node.tags || []).length > 0 && (
              <div className="sp-tags-row">
                <span className="sp-tags-label">tags</span>
                <div className="sp-tags-list">
                  {(node.tags || []).map(t => <span key={t} className="sp-tag">#{t}</span>)}
                </div>
                <button className="sp-edit" title="edit tags">✎</button>
              </div>
            )}
            <DescriptionEditor nodeId={nodeId} initial={node.description} />
          </section>
        ) : null}

        {children.length > 0 && (
          <section className="sp-section">
            <div className="sp-section-h">
              <span>contains <span className="sp-section-c">{children.length}</span></span>
              <span className="sp-section-meta">topology · auto</span>
            </div>
            <div className="sp-children">
              {children.map(c => (
                <button key={c.id} className="sp-child" onClick={() => onJumpNode(c.id)}>
                  <span className="sp-child-icon"><NodeIcon kind={c.kind} size={14} /></span>
                  <span className="sp-child-name">{c.name}</span>
                  <span className="sp-child-kind">{c.kind}</span>
                  <span className="sp-child-dot" style={{ background: c.status === 'err' ? 'var(--err)' : c.status === 'warn' ? 'var(--warn)' : 'var(--ok)' }} />
                </button>
              ))}
            </div>
          </section>
        )}

        {node.runbooks && node.runbooks.length > 0 && (
          <section className="sp-section">
            <div className="sp-section-h">
              <span>related runbooks</span>
              <span className="sp-section-meta">manually linked</span>
            </div>
            <div className="sp-runbooks">
              {node.runbooks.map(rid => {
                const rb = RUNBOOKS[rid]; if (!rb) return null;
                return (
                  <button key={rid} className="sp-runbook" onClick={() => onOpenRunbook(rid)}>
                    <div className="sp-rb-cat">{rb.category}</div>
                    <div className="sp-rb-title">{rb.title}</div>
                    <div className="sp-rb-meta">
                      <span className={`sp-rb-state sp-rb-state--${rb.state}`}>{rb.state}</span>
                      <span className="sp-rb-date">{rb.updated}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="sp-section sp-links">
          <div className="sp-section-h">
            <span>links</span>
            <span className="sp-section-meta">curated</span>
          </div>
          <a className="sp-link" href="#" onClick={(e) => e.preventDefault()}>
            <span className="sp-link-k">repo</span>
            <span className="sp-link-v">github.com/me/homelab</span>
            <span className="sp-link-arrow">↗</span>
          </a>
          <a className="sp-link" href="#" onClick={(e) => e.preventDefault()}>
            <span className="sp-link-k">grafana</span>
            <span className="sp-link-v">grafana.lab/d/{node.kind}</span>
            <span className="sp-link-arrow">↗</span>
          </a>
        </section>
      </div>
    </aside>
  );
}

