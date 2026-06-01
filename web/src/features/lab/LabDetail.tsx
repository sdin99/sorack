// @ts-nocheck — Phase 4 marker (lab mockup migration).

// lab-detail.jsx — NodeDetail (sheet body / panel body), full-screen Runbook viewer.

import * as React from "react";
import { useState as useStateD, useEffect as useEffectD, useMemo as useMemoD, useRef as useRefD } from "react";
import { useTranslation } from "react-i18next";
import { useSorack } from "@/lib/data-source/SorackData";
import { useNow } from "@/lib/use-now";
import { NodeIcon } from "@/components/icons/NodeIcon";
import { GearIcon } from "@/components/icons/GearIcon";
import { ALL_ICON_KINDS, iconForNode, iconForType } from "@/lib/icon-map";
import { INFRA_META, SOFTWARE, TYPE_DETAIL, isWidget, fieldValue, humanizeKey, defaultProbeType as infraProbeType, softwareProbeType, infraEntries, softwareIds, softwareForInfra, keepCompatibleSoftware, PROBE_TYPES, allowedProbeTypesFor } from "./node-detail-schema";
import { Dropdown } from "@/components/Dropdown";
import { TagsEditor } from "./TagsEditor";
import { CardGallery, type CardItem } from "./CardGallery";
import { RunbookEditor } from "./RunbookEditor";
import { RunbookList, CategoryIcon } from "./RunbookList";
import { ConfirmDialog } from "@/features/node-form/NodeActions";
import { fetchRunbookTemplates, type ApiRunbookTemplate } from "@/lib/data-source/api";
import { useQuery as useQueryD } from "@tanstack/react-query";
import { testProbe } from "@/lib/data-source/api";
import { slugify, uniqueSlug } from "@/lib/slug";

// ─── tiny markdown renderer (same as desktop) ──────────────────────
function renderMarkdown(md, onNodeJump, onRunbookJump, NODES, RUNBOOKS) {
  const lines = md.split('\n');
  const out = []; let i = 0, key = 0;
  const renderInline = (text) => {
    let s = text;
    // [[node:xxx]] / [[runbook:xxx]] (Phase 2 autocomplete output). Legacy
    // [[xxx]] still accepted - kind inferred (rb- prefix -> runbook).
    s = s.replace(/\[\[(?:(node|runbook):)?([\w-]+)\]\]/g, (_, kind, id) => `\u0000M:${kind || ""}:${id}\u0000`);
    s = s.replace(/`([^`]+)`/g, '\u0000C:$1\u0000');
    s = s.replace(/\*\*([^*]+)\*\*/g, '\u0000B:$1\u0000');
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '\u0000I:$1\u0000');
    const tokens = s.split('\u0000');
    return tokens.map((tok, j) => {
      if (tok.startsWith('M:')) {
        const rest = tok.slice(2);
        const sep = rest.indexOf(':');
        const explicitKind = sep >= 0 ? rest.slice(0, sep) : '';
        const id = sep >= 0 ? rest.slice(sep + 1) : rest;
        const isRb = explicitKind === 'runbook' || (!explicitKind && id.startsWith('rb-'));
        const target = isRb ? RUNBOOKS[id] : NODES[id];
        if (!target) return <span key={j} className="md-mention">[[{explicitKind ? `${explicitKind}:` : ''}{id}]]</span>;
        return (
          <button key={j} className={`md-mention md-mention--${isRb ? 'rb' : 'node'}`}
            onClick={() => isRb ? onRunbookJump(id) : onNodeJump(id)}>
            <span className="md-mention-kind">{isRb ? 'runbook' : target.kind}</span>
            <span className="md-mention-name">{isRb ? target.title : target.name}</span>
          </button>
        );
      }
      if (tok.startsWith('C:')) return <code key={j} className="md-code">{tok.slice(2)}</code>;
      if (tok.startsWith('B:')) return <strong key={j}>{tok.slice(2)}</strong>;
      if (tok.startsWith('I:')) return <em key={j}>{tok.slice(2)}</em>;
      return <React.Fragment key={j}>{tok}</React.Fragment>;
    });
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      out.push(<pre key={key++} className="md-pre"><code>{buf.join('\n')}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const lvl = h[1].length; const Tag = `h${lvl}`;
      out.push(<Tag key={key++} className={`md-h md-h${lvl}`}>{renderInline(h[2])}</Tag>);
      i++; continue;
    }
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(<blockquote key={key++} className="md-quote">{buf.map((b, k) => <div key={k}>{renderInline(b)}</div>)}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*[-*]\s+(\[[ x]\]\s+)?(.*)$/);
        const isCheck = !!m[1]; const checked = isCheck && m[1].includes('x');
        items.push({ isCheck, checked, text: m[2] }); i++;
      }
      out.push(<ul key={key++} className="md-ul">
        {items.map((it, k) => (
          <li key={k} className={it.isCheck ? 'md-li-check' : 'md-li'}>
            {it.isCheck && <span className={`md-check ${it.checked ? 'md-check--on' : ''}`}>{it.checked ? '✓' : ''}</span>}
            {renderInline(it.text)}
          </li>
        ))}
      </ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      out.push(<ol key={key++} className="md-ol">{items.map((t, k) => <li key={k}>{renderInline(t)}</li>)}</ol>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*[-*]\s|\s*\d+\.\s|```)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push(<p key={key++} className="md-p">{renderInline(buf.join(' '))}</p>);
  }
  return out;
}

// ─── NodeDetail body ───────────────────────────────────────────────
function StatusDot({ status }) { return <span className="sheet-peek-dot" style={{ background: status === 'err' ? 'var(--err)' : status === 'warn' ? 'var(--warn)' : 'var(--ok)' }} />; }

// "12s ago" / "5m ago" / "2h ago" — relative time against a passed-in
// `now` so it ticks live (see HealthAge / useNow).
function relTime(iso, now) {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// Live-ticking age label. Isolated so only this span re-renders each second,
// not the whole detail panel.
function HealthAge({ iso }) {
  const now = useNow();
  return <span className="nd-health-age">{relTime(iso, now)}</span>;
}

const STATUSES = ['unknown','ok','warn','err'];

// Small monoline padlock — replaces the 🔒 emoji on locked spec rows so
// the icon scales/colours with the surrounding text instead of looking
// like an unsized inline glyph.
const LockIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.5" y="6.5" width="9" height="6" rx="1.2" />
    <path d="M4.5 6.5V4.5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

// Editable spec-style row — mirrors the design's SpecRow but with a
// real inline edit mode. Click ✎ to start editing; Enter saves, Escape
// cancels, click outside also saves. `renderEditor` lets callers swap
// the plain text input for a select.
function EditableSpecRow({
  k,
  value,
  display,
  onSave,
  renderEditor,
  onDelete,
}) {
  const [editing, setEditing] = useStateD(false);
  const [draft, setDraft] = useStateD(value);
  const [busy, setBusy] = useStateD(false);
  const editRowRef = useRefD<HTMLDivElement | null>(null);

  useEffectD(() => { if (!editing) setDraft(value); }, [value, editing]);

  // Optional `override` lets a renderer that picks-and-commits (e.g. a
  // <select>) bypass the setDraft + setTimeout dance — which had a stale
  // closure: setTimeout captured the previous render's commit, which read
  // the previous render's `draft` (still equal to value), so `draft===value`
  // returned early and the PATCH never ran. Passing the new value directly
  // sidesteps the closure entirely.
  const commit = async (override?: any) => {
    const next = override !== undefined ? override : draft;
    if (next === value) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(next); setEditing(false); }
    catch (e) { /* leave editing mode so user can fix */ }
    finally { setBusy(false); }
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  // While the row is in edit mode, exit it when the user clicks outside or
  // presses Esc. Without this, custom editors that have their own popup
  // (e.g. our Dropdown for the parent picker) only handled Esc/outside
  // *while the popup itself was open* — once collapsed back to the trigger,
  // Esc bubbled up to NodeDetail (closing the whole sheet) and outside
  // clicks did nothing. Capture phase + stopPropagation keeps Esc from
  // reaching the sheet's window listener.
  useEffectD(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
      cancel();
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!editRowRef.current || !t) return;
      // Inside the editing row stays in edit mode.
      if (editRowRef.current.contains(t)) return;
      // The Dropdown menu is portal-rendered to body; clicks on its menu
      // shouldn't be treated as "outside" the editor.
      if (t.closest('.sd-dropdown-menu')) return;
      cancel();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [editing, value]);

  if (editing) {
    const editor = renderEditor
      ? renderEditor(draft, setDraft, commit, cancel)
      : <input
          className="spec-v-input"
          value={draft ?? ''}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
        />;
    return (
      <div ref={editRowRef} className="spec spec--curated spec--editing">
        <div className="spec-k">{k}</div>
        <div className="spec-v">{editor}</div>
        <div className="spec-tag" />
      </div>
    );
  }

  // Double-click on the value enters edit mode. No ✎ button — the row
  // is "obviously" editable because the input snaps in on dblclick,
  // and the value cell gets a subtle hover affordance via CSS. An optional
  // ✕ removes the field (used for manual fields).
  return (
    <div className="spec spec--curated spec--editable" onDoubleClick={() => setEditing(true)} title="double-click to edit">
      <div className="spec-k">{k}</div>
      <div className="spec-v">{display ?? (value || '—')}</div>
      <div className="spec-tag">
        {onDelete && <button className="spec-del" title="remove" aria-label="remove" onClick={(e) => { e.stopPropagation(); onDelete(); }}>✕</button>}
      </div>
    </div>
  );
}

// Read-only row for immutable fields like id. Same row layout as the
// auto-synced spec rows so it's visually grouped with "the system owns
// this".
function LockedSpecRow({ k, value }) {
  return (
    <div className="spec spec--auto">
      <div className="spec-k">{k}</div>
      <div className="spec-v">{String(value)}</div>
      <div className="spec-tag"><span className="spec-lock" title="immutable"><LockIcon /></span></div>
    </div>
  );
}

// Header icon picker — click to open a small grid of icon options.
// Suggestion order: the type's default icon first, then the rest.
// User can also "reset to default" to clear any custom override.
export function HeaderIcon({ node }) {
  const { updateNode } = useSorack();
  const [open, setOpen] = useStateD(false);
  const wrapRef = useRefD(null);
  const current = iconForNode(node);
  const typeDefault = iconForType(node.type || node.kind);
  const hasOverride = !!node.meta?.iconKind;

  useEffectD(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = async (kind) => {
    setOpen(false);
    // Partial meta PATCH: null clears iconKind (server strips it), else sets it.
    try { await updateNode(node.id, { meta: { iconKind: kind } }); } catch (e) { console.error(e); }
  };

  // Suggested ordering: type default first, then everything else.
  const ordered = [
    typeDefault,
    ...ALL_ICON_KINDS.filter((k) => k !== typeDefault),
  ];

  return (
    <div className="header-icon-wrap" ref={wrapRef}>
      <button className="sheet-head-icon header-icon-btn" onClick={() => setOpen((o) => !o)} title="change icon">
        <NodeIcon kind={current} size={20} />
      </button>
      {open && (
        <div className="icon-picker-pop">
          <div className="icon-picker-grid">
            {ordered.map((k) => (
              <button
                key={k}
                className={`icon-picker-cell ${k === current ? 'icon-picker-cell--on' : ''}`}
                onClick={() => pick(k)}
                title={k === typeDefault ? `${k} (default for ${node.type})` : k}
              >
                <NodeIcon kind={k} size={20} />
              </button>
            ))}
          </div>
          {hasOverride && (
            <button className="icon-picker-reset" onClick={() => pick(null)}>
              reset to {typeDefault} (type default)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Header name editor — name lives at the top of the sheet, so we don't
// duplicate it in spec rows. Double-click swaps the text for an input.
// `onIdChange` is fired when the rename triggered an id re-slug (only
// happens once, on the first rename of an auto-named placeholder).
export function EditableHeaderName({ node, onIdChange }: { node: any; onIdChange?: (id: string) => void }) {
  const { renameNode } = useSorack();
  const [editing, setEditing] = useStateD(false);
  const [draft, setDraft] = useStateD(node.name);
  useEffectD(() => { setDraft(node.name); }, [node.id, node.name]);

  const commit = async () => {
    if (draft === node.name || !draft.trim()) { setEditing(false); setDraft(node.name); return; }
    try {
      const newId = await renameNode(node.id, draft.trim());
      if (newId && newId !== node.id) onIdChange?.(newId);
    } finally { setEditing(false); }
  };
  const cancel = () => { setDraft(node.name); setEditing(false); };

  if (editing) {
    return (
      <input
        className="sheet-head-name-input"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter')  { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
      />
    );
  }
  return (
    <div className="sheet-head-name" onDoubleClick={() => setEditing(true)} title="double-click to rename">
      {node.name}
    </div>
  );
}

// Infra card gallery items, sorted by the canonical category order. Used by
// the header type picker (EditableHeaderType) and the new-node setup banner
// (NewNodeSetupBanner). Picking from either runs the same commit logic
// (commitInfraType): clear iconKind override + drop incompatible software.
const CATEGORY_ORDER = ["Compute", "Kubernetes", "Network", "Storage"];

export function buildInfraGalleryItems(currentType: string): CardItem[] {
  const items: CardItem[] = Object.entries(INFRA_META).map(([id, m]) => ({
    id, name: m.name, category: m.category, description: m.description, entries: TYPE_DETAIL[id],
  }));
  // Sort by the canonical category order, falling back to source order within
  // a category. Unknown categories sink to the end.
  items.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    const aOrd = ai < 0 ? CATEGORY_ORDER.length : ai;
    const bOrd = bi < 0 ? CATEGORY_ORDER.length : bi;
    return aOrd - bOrd;
  });
  // Preserve a legacy/free-text type that's not in the curated list so the
  // user can at least see and re-pick from it.
  if (currentType && !INFRA_META[currentType]) {
    items.push({ id: currentType, name: currentType, category: "Other" });
  }
  return items;
}

// Partial meta PATCH; server strips null root keys (iconKind) and merges the
// rest. software:null = remove key, software:[…] = replace array. Shared by
// the header type picker and the new-node setup banner so both apply the
// same side effects (icon snap + drop incompatible software).
export async function commitInfraType(node: any, next: string, updateNode: any) {
  if (!next || next === (node.kind || node.type)) return;
  try {
    const sw = keepCompatibleSoftware(node, next);
    await updateNode(node.id, { type: next, meta: { iconKind: null, software: sw.length ? sw : null } });
  } catch (e) { console.error(e); }
}

// Sheet head label. Click hands off to the parent (App.tsx Sheet) to open the
// shared infra gallery in grid mode — owner lift lets the kebab "Configure
// type…" action and NodeDetail's settings entries hit the same gallery.
export function EditableHeaderType({ node, onOpenGallery }) {
  const current = node.kind || node.type;
  return (
    <div
      className="sheet-head-kind sheet-head-kind--pick"
      onClick={() => onOpenGallery?.()}
      title="change type"
    >
      {current}
    </div>
  );
}

// New-node setup form (replaces NodeDetail body while node.meta.idAuto is
// true). Four fields: name, id, infra type, software list. The form keeps
// name/id in local state and commits them only on "Done" via renameNode +
// rekey — that's also when meta.idAuto drops and the panel switches over to
// the normal detail body. Type and software commit immediately through the
// galleries (so the graph icon + software badges update in real time and
// the choices persist if the user navigates away and back).
function NewNodeSetup({ node, updateNode, renameNode, allNodes, onIdChange }) {
  const { t } = useTranslation();
  // Strip the auto-placeholder names ("New", "New 2", …) so the user starts
  // with an empty field rather than having to delete the placeholder first.
  const isPlaceholderName = (s: string) => s === 'New' || /^New \d+$/.test(s);
  const [name, setName] = useStateD(isPlaceholderName(node.name || '') ? '' : (node.name || ''));
  const [idDraft, setIdDraft] = useStateD('');
  const [idManual, setIdManual] = useStateD(false);

  // Other-node ids (this node's own id is excluded — the rekey replaces it).
  const takenIds = useMemoD(() => {
    const s = new Set<string>();
    for (const n of allNodes) if (n?.id && n.id !== node.id) s.add(n.id);
    return s;
  }, [allNodes, node.id]);

  // While auto, mirror name → id slug. If the slug collides with another
  // node, uniqueSlug appends a counter (host → host-1 → host-2 → …) so the
  // user doesn't have to intervene. Deterministic, so no useRef stabilization
  // is needed — the same base always resolves to the same id.
  useEffectD(() => {
    if (idManual) return;
    const base = slugify(name) || '';
    if (!base) { setIdDraft(''); return; }
    setIdDraft(uniqueSlug(base, takenIds));
  }, [name, idManual, takenIds]);

  const [infraGalleryOpen, setInfraGalleryOpen] = useStateD(false);
  const [swGalleryOpen, setSwGalleryOpen] = useStateD(false);

  const items = useMemoD(() => buildInfraGalleryItems(node.type), [node.type]);
  const swItems = useMemoD(
    () => softwareForInfra(node.type).map(({ id, tpl }) => ({ id, name: tpl.name, category: tpl.category, description: tpl.description, entries: tpl.entries } satisfies CardItem)),
    [node.type]
  );
  const selectedSwIds = softwareIds(node);

  // Validation. Done is enabled only when name is non-empty, an infra type
  // is picked (always true since seed → curated default), and the id is a
  // valid slug that doesn't collide with another node. While auto, collisions
  // are resolved by the suffix logic above; the only way to land on a
  // collision is to hand-edit the id, so the error message only surfaces
  // for the manual case.
  const nameOk = name.trim().length > 0;
  const typeOk = !!node.type;
  const idClean = idDraft.trim();
  const idShapeOk = idClean.length > 0 && /^[a-z0-9][a-z0-9-]*$/.test(idClean);
  const idCollision = takenIds.has(idClean);
  const canFinish = nameOk && typeOk && idShapeOk && !idCollision;

  const onFinish = async () => {
    if (!canFinish) return;
    try {
      // nextId override only when the user picked a non-default id; otherwise
      // let renameNode do its normal slug-from-name path.
      const nextId = idClean && idClean !== slugify(name) ? idClean : undefined;
      const newId = await renameNode(node.id, name.trim(), nextId ? { nextId } : undefined);
      // Rekey changed the id; tell the parent so its selectedId follows.
      // Otherwise the detail panel would point at the now-deleted old id and
      // briefly blank out (NODES[oldId] = undefined → NodeDetail returns null).
      if (onIdChange && newId !== node.id) onIdChange(newId);
    } catch (e) { console.error(e); }
  };

  return (
    <>
      <div className="nd-setup-form">
        <div className="nd-setup-h">{t('nd.newNodeSetup', { defaultValue: 'new node — pick a type to scaffold its fields' })}</div>

        <label className="nd-setup-row">
          <span className="nd-setup-lbl">{t('nd.setupName', { defaultValue: 'name' })}</span>
          <input
            className="nd-setup-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('nd.setupNamePh', { defaultValue: 'new node name' })}
            autoFocus
          />
        </label>

        <label className="nd-setup-row">
          <span className="nd-setup-lbl">{t('nd.setupId', { defaultValue: 'id' })}</span>
          <span className="nd-setup-id-wrap">
            <input
              className={`nd-setup-input ${idCollision || (idClean && !idShapeOk) ? 'nd-setup-input--err' : ''}`}
              value={idDraft}
              onChange={(e) => { setIdDraft(e.target.value); setIdManual(true); }}
            />
            {!idManual && <span className="nd-setup-tag">{t('nd.autoField', { defaultValue: '(auto)' })}</span>}
          </span>
        </label>
        {idCollision && <div className="nd-setup-err">{t('nd.setupIdTaken', { defaultValue: 'id already in use' })}</div>}
        {!idCollision && idClean && !idShapeOk && (
          <div className="nd-setup-err">{t('nd.setupIdInvalid', { defaultValue: 'use a-z, 0-9, and -' })}</div>
        )}

        <div className="nd-setup-row">
          <span className="nd-setup-lbl">{t('nd.setupType', { defaultValue: 'type' })}</span>
          <button type="button" className="nd-setup-btn" onClick={() => setInfraGalleryOpen(true)}>
            {node.type}
          </button>
        </div>

        <div className="nd-setup-row">
          <span className="nd-setup-lbl">{t('nd.setupSoftware', { defaultValue: 'software' })}</span>
          <div className="nd-setup-sw">
            <button
              type="button"
              className="nd-setup-btn"
              onClick={() => setSwGalleryOpen(true)}
              disabled={swItems.length === 0}
            >
              {t('nodeActions.configureSoftware', { defaultValue: 'Configure software…' })}
            </button>
            {selectedSwIds.length > 0 && (
              <div className="nd-setup-chips">
                {selectedSwIds.map((swId) => (
                  <span key={swId} className="nd-setup-chip">{SOFTWARE[swId]?.name || swId}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="nd-setup-finish"
          disabled={!canFinish}
          onClick={onFinish}
        >
          {t('nd.setupFinish', { defaultValue: 'Done' })}
        </button>
      </div>

      <CardGallery
        open={infraGalleryOpen}
        mode="infra"
        title={t('nd.galleryPickType', { defaultValue: 'Pick a type' })}
        items={items}
        selectedIds={node.type ? [node.type] : []}
        onSelect={(next) => commitInfraType(node, next, updateNode)}
        onClose={() => setInfraGalleryOpen(false)}
      />
      <CardGallery
        open={swGalleryOpen}
        mode="software"
        title={t('nd.galleryPickSoftware', { defaultValue: 'Pick software' })}
        items={swItems}
        selectedIds={selectedSwIds}
        onSelect={(swId) => {
          const cur = softwareIds(node);
          const next = cur.includes(swId) ? cur.filter((x) => x !== swId) : [...cur, swId];
          updateNode(node.id, { meta: { software: next.length ? next : null } }).catch((e: any) => console.error(e));
        }}
        onClose={() => setSwGalleryOpen(false)}
      />
    </>
  );
}

// (software is shown/managed in the detail body via SoftwareSections, not the
// header — the header stays infra-only.)

// ─── Per-type detail body (schema-driven) ──────────────────────────
// Walks TYPE_DETAIL[type]: field defs become labeled rows (read from the
// matching meta bag, hidden when the source hasn't filled them), widget defs
// become reusable widgets that self-hide until their observed data lands.

function fmtVal(v) {
  if (Array.isArray(v)) return v.join(', ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// One labeled resource bar. `m` is meta.observed.metrics[key], shaped as
// { used, total, unit? } or { pct }. Renders "—" gracefully if partial.
function MetricGauge({ label, m }) {
  const pct = typeof m?.pct === 'number'
    ? Math.round(m.pct)
    : (m && typeof m.used === 'number' && m.total ? Math.round((m.used / m.total) * 100) : null);
  const tone = pct == null ? '' : pct >= 90 ? 'nd-gauge--err' : pct >= 75 ? 'nd-gauge--warn' : '';
  return (
    <div className={`nd-gauge ${tone}`}>
      <div className="nd-gauge-top">
        <span className="nd-gauge-label">{label}</span>
        <span className="nd-gauge-val">{pct != null ? `${pct}%` : '—'}</span>
      </div>
      <div className="nd-gauge-track"><div className="nd-gauge-fill" style={{ width: `${pct ?? 0}%` }} /></div>
      {(m && typeof m.used === 'number' && typeof m.total === 'number') && (
        <div className="nd-gauge-sub">{m.used} / {m.total}{m.unit ? ` ${m.unit}` : ''}</div>
      )}
    </div>
  );
}

// Gauges stay on the infra-axis bag (meta.observed.metrics). Earlier this
// fell through to any software's metrics bag, which let a proxmox software
// secretly populate host metrics — breaking the rule that host axis
// shouldn't depend on what software is attached. When a host-axis adapter
// lands (system source), it'll write meta.observed.metrics; until then the
// gauges self-hide.
function GaugesWidget({ node, def, t }) {
  const metrics = node?.meta?.observed?.metrics ?? {};
  const items = (def.metrics || []).map((k) => ({ k, m: metrics[k] })).filter((x) => x.m);
  if (!items.length) return null;
  return (
    <section className="nd-section">
      <div className="nd-section-h"><span>{t(def.header)}</span></div>
      <div className="nd-gauges">
        {items.map(({ k, m }) => <MetricGauge key={k} label={k} m={m} />)}
      </div>
    </section>
  );
}

// k8s workload tallies — observed.k8s.{pods,deployments,…} as { ready, total }
// or { count }. Renders ready/total when both present, else the bare count.
function CountGridWidget({ node, def, t }) {
  const k = node?.meta?.observed?.k8s;
  if (!k) return null;
  const cells = [
    ['pods', k.pods], ['deploys', k.deployments], ['statefulsets', k.statefulsets],
    ['services', k.services], ['ingresses', k.ingresses],
  ].filter(([, v]) => v);
  if (!cells.length) return null;
  return (
    <section className="nd-section">
      <div className="nd-section-h"><span>{t(def.header)}</span></div>
      <div className="nd-countgrid">
        {cells.map(([label, v]) => {
          const total = v.total ?? v.count;
          const show = (v.ready != null && v.total != null) ? `${v.ready}/${total}` : String(total ?? '—');
          const short = v.total != null && v.ready != null && v.ready < v.total;
          return (
            <div key={label} className={`nd-count ${short ? 'nd-count--short' : ''}`}>
              <div className="nd-count-v">{show}</div>
              <div className="nd-count-k">{label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Per-pod / per-workload list — observed.k8s.workloads = [{ name, kind, status }].
// Own grid (name gets the flex column) so long pod names don't get crushed
// into the icon slot the .nd-child grid reserves.
function WorkloadListWidget({ node, def, t }) {
  const list = node?.meta?.observed?.k8s?.workloads;
  if (!list || !list.length) return null;
  return (
    <section className="nd-section">
      <div className="nd-section-h"><span>{t(def.header)} <span className="nd-section-c">{list.length}</span></span></div>
      <div className="nd-workloads">
        {list.map((w, i) => (
          <div key={i} className="nd-workload">
            <span className="nd-workload-name" title={w.name}>{w.name}</span>
            <span className="nd-workload-kind">{w.kind}</span>
            <StatusDot status={w.status} />
          </div>
        ))}
      </div>
    </section>
  );
}

// Shared field-row renderer for a given list of FieldDefs. Manual fields are
// editable (✕ to clear); adapter fields are read-only and show a greyed
// "(auto)" when empty. `showAll` false hides empty rows. Used by the infra
// spec AND each software section.
const isFieldSet = (v) => v !== undefined && v !== null && v !== '';
function FieldRows({ node, fieldDefs, setManual, showAll, swId }: { node: any; fieldDefs: any[]; setManual: any; showAll: boolean; swId?: string }) {
  const { t } = useTranslation();
  return (
    <>
      {fieldDefs.map((def) => {
        const val = fieldValue(node, def, swId);
        const has = isFieldSet(val);
        if (!has && !showAll) return null;
        // Manual override = the user typed a value into meta.manual.<key>.
        // For manual-source fields this is the only source; for auto-source
        // fields it wins over the adapter reading. Delete is offered only
        // when there's something the user owns to remove (an override or a
        // manual-source value) — you can't "delete" an adapter reading.
        const overridden = isFieldSet(node?.meta?.manual?.[def.key]);
        const canDelete = def.source === 'manual' ? has : overridden;
        const display = has
          ? `${fmtVal(val)}${def.unit ? ` ${def.unit}` : ''}`
          : t('nd.autoField', { defaultValue: '(auto)' });
        return (
          <EditableSpecRow
            key={def.key}
            k={def.label}
            value={has ? String(val) : ''}
            display={display}
            onSave={(v) => setManual(def.key, v)}
            onDelete={canDelete ? () => setManual(def.key, null) : undefined}
          />
        );
      })}
    </>
  );
}

// "+ field" affordance: add a manual field. Offers the type's schema-declared
// but currently-unset manual keys, plus a custom key. Per-type field richness
// (special editors, validation) comes later; this is the generic mechanism.
function AddFieldRow({ node, onAdd }) {
  const { t } = useTranslation();
  const [open, setOpen] = useStateD(false);
  const [key, setKey] = useStateD('');
  const [val, setVal] = useStateD('');
  const [msg, setMsg] = useStateD('');

  // Declared type fields are shown inline (show-all), so "+ field" is for a
  // CUSTOM key the schema doesn't cover.
  const reset = () => { setOpen(false); setKey(''); setVal(''); setMsg(''); };
  const save = () => {
    const k = key.trim();
    if (!k) { setMsg(t('nd.needKey', { defaultValue: 'key required' })); return; }
    if (!val.trim()) { setMsg(t('nd.needValue', { defaultValue: 'value required' })); return; }
    onAdd(k, val);
    reset();
  };

  if (!open) {
    return <button className="nd-addfield-sm" onClick={() => setOpen(true)}>+ {t('nd.addCustomField', { defaultValue: 'custom field' })}</button>;
  }
  return (
    <div className="nd-addfield-form">
      <input className="spec-v-input" placeholder="key" value={key} autoFocus onChange={(e) => setKey(e.target.value)} />
      <input
        className="spec-v-input"
        placeholder="value"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reset(); }}
      />
      <button className="nd-addfield-btn nd-addfield-btn--save" onClick={save}>{t('action.save')}</button>
      <button className="nd-addfield-btn" onClick={reset}>{t('action.cancel')}</button>
      {msg && <div className="nd-addfield-msg">{msg}</div>}
    </div>
  );
}

const setManualFor = (node, updateNode) => (key, v) =>
  updateNode(node.id, { meta: { manual: { [key]: (v === '' || v == null ? null : v) } } }).catch((err) => console.error(err));

// Infra (axis 1) spec rows: the infra type's fields + any leftover/custom
// manual keys + "+ custom field". Software fields live in their own sections
// (SoftwareSections), not here.
function TypeSpecRows({ node, updateNode, showAll }) {
  const setManual = setManualFor(node, updateNode);
  const infraDefs = infraEntries(node).filter((e) => !isWidget(e));
  // Declared manual keys across infra AND every selected software, so a
  // software field never shows up here as an "extra".
  const declared = new Set(infraDefs.filter((d) => d.source === 'manual').map((d) => d.key));
  for (const id of softwareIds(node)) {
    for (const e of (SOFTWARE[id]?.entries || [])) {
      if (!isWidget(e) && e.source === 'manual') declared.add(e.key);
    }
  }
  const manual = node?.meta?.manual || {};
  const extras = Object.keys(manual).filter((k) => !declared.has(k) && isFieldSet(manual[k]));
  return (
    <>
      <FieldRows node={node} fieldDefs={infraDefs} setManual={setManual} showAll={showAll} />
      {extras.map((k) => (
        <EditableSpecRow key={'x-' + k} k={humanizeKey(k)} value={String(manual[k])} onSave={(v) => setManual(k, v)} onDelete={() => setManual(k, null)} />
      ))}
      <AddFieldRow node={node} onAdd={setManual} />
    </>
  );
}

// Axis 2: one section per software the node runs (always sectioned, even a
// single one, so its identity is labeled). Header infra-only means this is
// where software shows. Each section = name + remove + its fields. Adding
// software is done from the node kebab menu (App.tsx), not a body button.
// Small two-item popover triggered by the software-section kebab. Replaces
// the old ✕-only button so "configure" (jump to the software's gallery
// detail) and "remove" both live in one menu — the section header stays
// uncluttered and the actions group correctly.
function SoftwareKebab({ onConfigure, onRemove }: { onConfigure: () => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useStateD(false);
  return (
    <div className="nd-sw-kebab-wrap">
      <button
        type="button"
        className="nd-sw-kebab"
        onClick={() => setOpen((o) => !o)}
        title={t('action.more', { defaultValue: 'more actions' })}
        aria-label={t('action.more', { defaultValue: 'more actions' })}
      >
        {/* Same SVG as App.tsx Ic.kebab — Unicode ⋮ has asymmetric metrics
            across fonts, so we render the dots ourselves to stay centered. */}
        <svg width="18" height="18" viewBox="0 0 22 22" fill="currentColor">
          <circle cx="11" cy="5" r="1.7" />
          <circle cx="11" cy="11" r="1.7" />
          <circle cx="11" cy="17" r="1.7" />
        </svg>
      </button>
      {open && (
        <>
          {/* Click anywhere outside to dismiss. Fixed so the menu doesn't
              trap pointer events outside the section. */}
          <div className="nd-sw-kebab-backdrop" onClick={() => setOpen(false)} />
          {/* Items reuse .action-menu-item so they match the right-click /
              sheet-kebab popover exactly (icon col + label + danger soft
              hover). Outer .nd-sw-kebab-menu only handles positioning. */}
          <div className="nd-sw-kebab-menu" role="menu">
            <button type="button" className="action-menu-item" onClick={() => { setOpen(false); onConfigure(); }}>
              <span className="action-menu-icon"><GearIcon size={14} /></span>
              <span className="action-menu-label">{t('nodeActions.configureThis', { defaultValue: 'Configure…' })}</span>
            </button>
            <button type="button" className="action-menu-item action-menu-item--danger" onClick={() => { setOpen(false); onRemove(); }}>
              <span className="action-menu-icon">
                <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h10M7 5V3.5h4V5M5.5 5l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" />
                </svg>
              </span>
              <span className="action-menu-label">{t('nodeActions.remove', { defaultValue: 'Remove' })}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SoftwareSections({ node, updateNode, showAll, onConfigureSoftware }) {
  const ids = softwareIds(node);
  const setManual = setManualFor(node, updateNode);
  const setSoftware = (next) => updateNode(node.id, { meta: { software: next.length ? next : null } }).catch((err) => console.error(err));
  return (
    <>
      {ids.map((id) => {
        const tpl = SOFTWARE[id];
        if (!tpl) return null;
        const defs = tpl.entries.filter((e) => !isWidget(e));
        return (
          <section key={id} className="nd-section">
            <div className="nd-section-h">
              <span>{tpl.name}</span>
              <SoftwareKebab
                onConfigure={() => onConfigureSoftware?.(id)}
                onRemove={() => setSoftware(ids.filter((x) => x !== id))}
              />
            </div>
            <div className="specs">
              <FieldRows node={node} fieldDefs={defs} setManual={setManual} showAll={showAll} swId={id} />
            </div>
          </section>
        );
      })}
    </>
  );
}

// Type-specific widgets. `only` restricts to a subset so summary widgets
// (gauges / countGrid) can sit above the spec while the detailed workload
// list sits below it. Self-hide until their observed source has data.
function TypeWidgets({ node, only }) {
  const { t } = useTranslation();
  const widgets = infraEntries(node).filter(isWidget).filter((w) => !only || only.includes(w.widget));
  return (
    <>
      {widgets.map((w, i) => {
        if (w.widget === 'gauges') return <GaugesWidget key={i} node={node} def={w} t={t} />;
        if (w.widget === 'countGrid') return <CountGridWidget key={i} node={node} def={w} t={t} />;
        if (w.widget === 'workloadList') return <WorkloadListWidget key={i} node={node} def={w} t={t} />;
        return null; // childList: covered by the common "contains" section for now
      })}
    </>
  );
}

// Unified status line at the top of the panel.
//  - probed node  → live collector health (read-only): message, source, the
//    probe latency, and a ticking "checked Ns ago" so you can SEE it's live.
//  - unprobed node → the manual status, click-to-edit. So every node has a
//    status here and we don't lose manual status setting on nodes the
//    collector doesn't touch.
// Multi-aspect StatusLine (B-3).
//
// A node can be monitored from several angles at once: infra (meta.probe →
// meta.observed.health) plus zero or more software probes (meta.softwareProbes
// → meta.observed.software[swId]). The line shows ONE primary aspect's live
// reading; if more than one aspect is in play, a pill row under the main
// line lets the user pick which one is the "face" of this node — that
// primary's status is what node.status (and so the topology dot) follows.
//
// Branches in priority order:
//   1. Any observed aspect    → primary's live reading + ⚙ (opens its
//                                settings: infra → infra gallery / sw → sw
//                                gallery) + pill row if total aspects > 1
//   2. Probe set, no observed → "awaiting first check…" same shape
//   3. No probe at all        → muted "not monitored" + `+`
//
// The pill click writes meta.statusPrimary; the collector reads it on its
// next tick to flip node.status. UI is optimistic via the existing
// updateNode mutation.
function StatusLine({ node, updateNode, onOpenSettings }: { node: any; updateNode: any; onOpenSettings?: (aspect: string) => void }) {
  const { t } = useTranslation();

  // Maintenance — operator-set pause. While active, collector skips probing
  // and the status line shows a dedicated "in maintenance" row with the
  // since-when age + a resume button. Probe configs and last known status
  // are preserved (just hidden) so resuming returns to the prior baseline.
  const maintenance = node.meta?.maintenance as { since?: string } | undefined;
  const toggleMaintenance = () => {
    const patch = maintenance
      ? { meta: { maintenance: null } }
      : { meta: { maintenance: { since: new Date().toISOString() } } };
    updateNode(node.id, patch).catch((e: any) => console.error('toggle maintenance:', e));
  };

  if (maintenance) {
    return (
      <div className="nd-health nd-health--maint">
        <span className="nd-health-dot nd-health-dot--maint" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 22 22" fill="currentColor">
            <rect x="7" y="5" width="3" height="12" rx="0.5" />
            <rect x="12" y="5" width="3" height="12" rx="0.5" />
          </svg>
        </span>
        <span className="nd-health-status">{t('nd.inMaintenance', { defaultValue: 'in maintenance' })}</span>
        <span className="nd-health-end">
          {maintenance.since && <HealthAge iso={maintenance.since} />}
          <button
            className="nd-health-add"
            onClick={(e) => { e.stopPropagation(); toggleMaintenance(); }}
            title={t('nd.resumeMonitoring', { defaultValue: 'resume monitoring' })}
            aria-label={t('nd.resumeMonitoring', { defaultValue: 'resume monitoring' })}
            type="button"
          >
            <svg width="10" height="10" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
              <path d="M7 5l11 6-11 6V5z" />
            </svg>
          </button>
        </span>
      </div>
    );
  }

  // Gather aspects in a stable order: infra first, then softwares in the order
  // meta.software lists them. Pending = probe set without an observed reading
  // yet (just configured, or between collector ticks).
  type Aspect = { key: string; label: string; health?: any; pendingType?: string };
  const swIds = softwareIds(node);
  const swObs = (node.meta?.observed?.software ?? {}) as Record<string, any>;
  const swProbes = (node.meta?.softwareProbes ?? {}) as Record<string, any>;
  const aspects: Aspect[] = [];
  // Infra
  if (node.meta?.observed?.health) {
    aspects.push({ key: 'infra', label: t('nd.aspectInfra', { defaultValue: 'infra' }), health: node.meta.observed.health });
  } else if (node.meta?.probe) {
    aspects.push({ key: 'infra', label: t('nd.aspectInfra', { defaultValue: 'infra' }), pendingType: node.meta.probe.type });
  }
  // Softwares — only the ones actually attached to this node
  for (const swId of swIds) {
    const label = SOFTWARE[swId]?.name || swId;
    if (swObs[swId]?.health) aspects.push({ key: swId, label, health: swObs[swId].health });
    else if (swProbes[swId]) aspects.push({ key: swId, label, pendingType: swProbes[swId].type });
  }

  // Primary: meta.statusPrimary if it still refers to a live aspect, else the
  // first one — observed first, pending last.
  const primaryKey = (typeof node.meta?.statusPrimary === 'string'
    && aspects.some((a) => a.key === node.meta.statusPrimary))
    ? node.meta.statusPrimary
    : (aspects.find((a) => a.health)?.key ?? aspects[0]?.key);
  const primary = aspects.find((a) => a.key === primaryKey);

  const SettingsBtn = onOpenSettings ? (
    <button
      className="nd-health-settings"
      onClick={(e) => { e.stopPropagation(); onOpenSettings(primaryKey || 'infra'); }}
      title={t('nd.openMonitoringSettings', { defaultValue: 'monitoring settings' })}
      aria-label={t('nd.openMonitoringSettings', { defaultValue: 'monitoring settings' })}
      type="button"
    >
      <GearIcon size={14} />
    </button>
  ) : null;

  // Pause/maintenance entry — sits next to the gear so the operator can flip
  // a node into maintenance from the same surface they configure monitoring.
  const MaintenanceBtn = (
    <button
      className="nd-health-settings"
      onClick={(e) => { e.stopPropagation(); toggleMaintenance(); }}
      title={t('nd.enterMaintenance', { defaultValue: 'enter maintenance' })}
      aria-label={t('nd.enterMaintenance', { defaultValue: 'enter maintenance' })}
      type="button"
    >
      <svg width="12" height="12" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true">
        <rect x="7" y="5" width="3" height="12" rx="0.5" />
        <rect x="12" y="5" width="3" height="12" rx="0.5" />
      </svg>
    </button>
  );

  // Pill row under the main line — only when there's more than one aspect.
  // Each pill's color tracks that aspect's observed status (pending = muted).
  const PillRow = aspects.length > 1 ? (
    <div className="nd-health-pills">
      {aspects.map((a) => {
        const status = a.health?.status ?? 'pending';
        const active = a.key === primaryKey;
        return (
          <button
            key={a.key}
            type="button"
            className={`nd-health-pill nd-health-pill--${status} ${active ? 'nd-health-pill--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (active) return;
              updateNode(node.id, { meta: { statusPrimary: a.key } }).catch((err: any) => console.error(err));
            }}
            title={a.label}
          >
            <span className="nd-health-pill-dot" />
            <span className="nd-health-pill-lbl">{a.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  // Branch 1/2: at least one probe configured.
  if (primary?.health) {
    const h = primary.health;
    return (
      <>
        <div className={`nd-health nd-health--${h.status}`}>
          <span className="nd-health-dot" />
          <span className="nd-health-status">{h.message || h.status}</span>
          <span className="nd-health-src">{t('nd.healthVia', { source: h.source, defaultValue: `via {{source}}` })}</span>
          {typeof h.latencyMs === 'number' && <span className="nd-health-lat">{h.latencyMs}ms</span>}
          <span className="nd-health-end">
            {h.lastCheckedAt && <HealthAge iso={h.lastCheckedAt} />}
            {SettingsBtn}
            {MaintenanceBtn}
          </span>
        </div>
        {PillRow}
      </>
    );
  }
  if (primary?.pendingType) {
    return (
      <>
        <div className="nd-health nd-health--pending">
          <span className="nd-health-dot" />
          <span className="nd-health-status">{t('nd.awaitingCheck', { defaultValue: 'awaiting first check…' })}</span>
          <span className="nd-health-src">{t('nd.healthVia', { source: primary.pendingType, defaultValue: `via {{source}}` })}</span>
          <span className="nd-health-end">
            {SettingsBtn}
            {MaintenanceBtn}
          </span>
        </div>
        {PillRow}
      </>
    );
  }

  // Branch 3: not monitored. Row is the click target; explicit `+` for
  // affordance and accessibility. `onOpenSettings('infra')` lands in the
  // infra gallery — software monitoring needs the software card anyway.
  return (
    <div
      className="nd-health nd-health--off"
      onClick={() => onOpenSettings?.('infra')}
      role={onOpenSettings ? 'button' : undefined}
      tabIndex={onOpenSettings ? 0 : undefined}
      onKeyDown={(e) => { if (onOpenSettings && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpenSettings('infra'); } }}
    >
      <span className="nd-health-dot" />
      <span className="nd-health-status">{t('nd.notMonitored', { defaultValue: 'not monitored' })}</span>
      <span className="nd-health-end">
        {onOpenSettings && (
          <button
            className="nd-health-add"
            onClick={(e) => { e.stopPropagation(); onOpenSettings('infra'); }}
            title={t('nd.setupMonitoring', { defaultValue: 'set up monitoring' })}
            aria-label={t('nd.setupMonitoring', { defaultValue: 'set up monitoring' })}
            type="button"
          >
            <svg width="12" height="12" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M11 5v12M5 11h12" />
            </svg>
          </button>
        )}
        {MaintenanceBtn}
      </span>
    </div>
  );
}

// ─── Probe (monitoring) control ────────────────────────────────────
// Opt-in: a node is monitored only once the operator configures meta.probe
// here. The form's probe type defaults from the node type and prefills what
// it can infer (k8s namespace = node name, tcp host = manual ip); the rest is
// entered. A "test" button runs the probe once (no save) so it can be
// verified before committing. Removing clears probe + its observed data.
//
// B-2: ProbeControl lives INSIDE the card-gallery's detail view (under the
// current type's card) — the "settings" surface. NodeDetail uses
// MonitoringSummary instead: a read-only status line + CTA that opens the
// gallery straight into that detail view.
// PROBE_TYPES is imported from the schema (single source of truth). Per-card
// restrictions come from allowedProbeTypesFor(node, aspect). Default probe
// type comes from the node's infra (INFRA_META.probe), via the schema helper
// infraProbeType(node).

function buildProbe(type, f) {
  if (type === 'tcp') return { type: 'tcp', host: f.host.trim(), port: Number(f.port) };
  if (type === 'http') return { type: 'http', url: f.url.trim(), ...(f.expect.trim() ? { expect: f.expect.trim() } : {}) };
  if (type === 'k8s') return { type: 'k8s', namespace: f.namespace.trim() };
  // proxmox: PVE node name required; host optional (the adapter falls back to
  // the node's own manual.ip, so a blank host uses that).
  if (type === 'proxmox') return { type: 'proxmox', node: f.node.trim(), ...(f.host.trim() ? { host: f.host.trim() } : {}) };
  // system: node_exporter scrape — host optional (adapter falls back to
  // manual.ip), port default 9100. Future transports go under `transport`.
  if (type === 'system') return { type: 'system', ...(f.host.trim() ? { host: f.host.trim() } : {}), ...(f.port.trim() ? { port: Number(f.port) } : {}) };
  return { type };
}
function probeSummary(p) {
  if (!p) return '';
  if (p.type === 'tcp') return `${p.host}:${p.port}`;
  if (p.type === 'http') return p.url;
  if (p.type === 'k8s') return p.namespace;
  if (p.type === 'proxmox') return p.node;
  if (p.type === 'system') return `${p.host || 'auto'}:${p.port || 9100}`;
  return p.type;
}

// Label-left / input-right row used by the monitoring form. MUST live outside
// ProbeControl: defining a component inside a component re-creates the type
// every render, so React unmounts/remounts the input each keystroke and the
// focus is lost. (That bug is what dropped the user from typing mid-IP.)
function ProbeField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="probe-field">
      <span className="probe-field-lbl">{label}</span>
      {children}
    </div>
  );
}

// Card-type-locked monitoring form. The card's probe type is fixed by the
// schema — INFRA_META.probe for infra cards, SOFTWARE[swId].probe for
// software cards. No dropdown. The form is always open — edits commit through
// Save; no editing toggle. Remove appears only when a probe already exists.
//
// `aspect` selects which slot this form reads/writes:
//   - 'infra'  → meta.probe (and meta.observed.health when monitored)
//   - swId     → meta.softwareProbes[swId] (and meta.observed.software[swId])
//
// host→HTTP / vm→proxmox / etc. mix-and-match is intentionally NOT supported
// (one card, one probe type). Multiple probes per node = one per aspect.
function ProbeControl({ node, updateNode, aspect = 'infra' }: { node: any; updateNode: any; aspect?: string }) {
  const { t } = useTranslation();
  const isInfra = aspect === 'infra';
  const probe = isInfra ? node.meta?.probe : node.meta?.softwareProbes?.[aspect];

  // Probe type is normally the card's schema default (INFRA_META.probe for an
  // infra card, SOFTWARE[swId].probe for a software card). But the operator
  // may want a different transport — e.g. a tcp/22 alive check on a host whose
  // schema default is 'system'. So the schema picks the default, an existing
  // saved probe pins it (so opening the form shows the saved type), and the
  // dropdown below the form lets the operator switch any time. buildProbe
  // already supports all PROBE_TYPES — no data-model change needed.
  const defaultType = isInfra ? infraProbeType(node) : softwareProbeType(aspect);
  const probeType: string = (probe?.type as string) ?? defaultType;
  const [type, setType] = useStateD<string>(probeType);
  // Re-sync local state when the saved probe's type changes (e.g. user saves
  // a new probe of a different type, or navigates between cards). Stays
  // stable across the React Query 5s refetch since probeType is a primitive.
  useEffectD(() => { setType(probeType); }, [probeType]);

  // CRITICAL: deps must be PRIMITIVE, not the `probe` object. React Query
  // refetches inventory every 5s, returning a new node object reference each
  // time — but the actual probe values are unchanged. If we depend on `probe`
  // (object identity), useMemoD recomputes `initial`, the reset effect fires,
  // and the user's half-typed input (e.g. an unsaved TCP port) gets blown
  // away every 5 seconds. Decomposing into the underlying primitive fields
  // keeps `initial` stable across refetches.
  const initial = useMemoD(() => ({
    host: probe?.host ?? (type === 'tcp' ? (node.meta?.manual?.ip ?? '') : ''),
    port: probe?.port != null ? String(probe.port) : (type === 'system' ? '9100' : ''),
    url: probe?.url ?? '',
    expect: probe?.expect ?? '',
    namespace: probe?.namespace ?? (type === 'k8s' ? node.name : ''),
    pveNode: probe?.node ?? (type === 'proxmox' ? (node.meta?.manual?.hostname ?? '') : ''),
  }), [
    probe?.host, probe?.port, probe?.url, probe?.expect, probe?.namespace, probe?.node,
    type, node.id, node.name, node.meta?.manual?.ip, node.meta?.manual?.hostname,
  ]);

  const [f, setF] = useStateD(initial);
  const [test, setTest] = useStateD<any>(null); // null | 'running' | {status,latencyMs,message}
  const [busy, setBusy] = useStateD(false);
  const [msg, setMsg] = useStateD('');
  // Brief "Saved ✓" feedback on a successful save (clears after 1.8s) so the
  // user has something to confirm the write landed. Timer is cleared on
  // unmount to avoid a setState on a stale component.
  const [justSaved, setJustSaved] = useStateD(false);
  const savedTimerRef = useRefD<any>(null);
  useEffectD(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);
  // Reset the form when the underlying node/probe/type changes (e.g. user
  // navigates between cards or the collector flips a value). Otherwise stale
  // local state survives across nodes.
  useEffectD(() => { setF(initial); setTest(null); setMsg(''); }, [initial]);

  const validationMsg = () => {
    if (type === 'tcp') return t('nd.needHostPort', { defaultValue: 'host and port required' });
    if (type === 'http') return t('nd.needUrl', { defaultValue: 'url required' });
    if (type === 'k8s') return t('nd.needNamespace', { defaultValue: 'namespace required' });
    if (type === 'proxmox') return t('nd.needPveNode', { defaultValue: 'PVE node name required' });
    if (type === 'system') return t('nd.needSystemHost', { defaultValue: 'host required (or set manual.ip)' });
    return '';
  };

  // Host fallback: tcp + proxmox both accept a blank host iff manual.ip is
  // set (the adapter reads it). The form mirrors that, so a user with a
  // pre-filled manual.ip can submit by typing just the port.
  const manualIp: string = node.meta?.manual?.ip ?? '';
  const valid = () => {
    if (type === 'tcp') {
      const hostOk = !!f.host.trim() || !!manualIp;
      return hostOk && !!f.port.trim() && !Number.isNaN(Number(f.port));
    }
    if (type === 'http') return !!f.url.trim();
    if (type === 'k8s') return !!f.namespace.trim();
    if (type === 'proxmox') return !!f.pveNode.trim();
    if (type === 'system') {
      // system probe: host blank ok iff manual.ip set (adapter fallback). Port
      // is optional too — adapter defaults to 9100.
      return !!f.host.trim() || !!manualIp;
    }
    return false;
  };

  // buildProbe takes the form's fields; remap pveNode → node so the existing
  // helper keeps working without a signature change.
  const currentBuilt = () => buildProbe(type, { ...f, node: f.pveNode });

  const runTest = async () => {
    if (!valid()) { setMsg(validationMsg()); return; }
    setMsg(''); setTest('running');
    try { setTest(await testProbe(node.id, currentBuilt())); }
    catch (e: any) { setTest({ status: 'err', message: e?.message || 'test failed' }); }
  };
  // Patch shape differs by aspect: infra writes the root probe key; a
  // software probe writes one entry into softwareProbes (the PATCH route
  // merges sibling software-probe entries). Null removes either.
  const save = async () => {
    if (!valid()) { setMsg(validationMsg()); return; }
    setMsg(''); setBusy(true);
    const patch = isInfra
      ? { meta: { probe: currentBuilt() } }
      : { meta: { softwareProbes: { [aspect]: currentBuilt() } } };
    try {
      await updateNode(node.id, patch);
      setJustSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 1800);
    } catch (e) { console.error(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    const patch = isInfra
      ? { meta: { probe: null } }
      : { meta: { softwareProbes: { [aspect]: null } } };
    try { await updateNode(node.id, patch); }
    catch (e) { console.error(e); }
  };

  // Plain placeholder — host accepts an IP OR a hostname (the adapter just
  // hands it to net.Socket / fetch). manual.ip is just one source; the
  // "use node IP" chip next to the input makes the fallback explicit so the
  // placeholder stays clean.
  const hostPh = manualIp || 'host or IP';
  // "Use node IP" chip — wired only when manual.ip is set. Clicking it pastes
  // manual.ip into the host field; explicit beats relying on a placeholder.
  const useNodeIp = (key: 'host') => () => { if (manualIp) setF({ ...f, [key]: manualIp }); };

  // Restrict the type dropdown to what makes sense for this card (e.g. host
  // → system/tcp/http, postgresql → tcp only). If a saved probe happens to
  // use a type that's no longer allowed (schema tightened, hand-edited DB
  // row), keep that type in the list so the operator can see and change it
  // rather than silently dropping it.
  const allowed = allowedProbeTypesFor(node, aspect);
  const typeOptions = (allowed.includes(type) ? allowed : [...allowed, type])
    .map((p) => ({ value: p, label: p }));

  return (
    <div className="probe-form">
      <div className="probe-form-grid">
        <ProbeField label="type">
          <Dropdown
            value={type}
            onChange={setType}
            options={typeOptions}
            ariaLabel={t('nd.probeTypeAria', { defaultValue: 'probe type' })}
            className="probe-type-dropdown"
          />
        </ProbeField>
        {type === 'tcp' && (
          <>
            <ProbeField label="host">
              <input className="probe-input" placeholder={hostPh} value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} />
              {manualIp && (
                <button type="button" className="probe-chip" onClick={useNodeIp('host')} title={t('nd.useNodeIp', { defaultValue: "use this node's IP" })}>
                  {t('nd.useNodeIp', { defaultValue: "use node IP" })}
                </button>
              )}
            </ProbeField>
            <ProbeField label="port">
              <input className="probe-input" placeholder="443" inputMode="numeric" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} />
            </ProbeField>
          </>
        )}
        {type === 'http' && (
          <>
            <ProbeField label="url">
              <input className="probe-input" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
            </ProbeField>
            <ProbeField label={t('nd.httpExpectLbl', { defaultValue: 'expect' })}>
              <input className="probe-input" placeholder={t('nd.httpExpectPh', { defaultValue: 'optional substring' })} value={f.expect} onChange={(e) => setF({ ...f, expect: e.target.value })} />
            </ProbeField>
          </>
        )}
        {type === 'k8s' && (
          <ProbeField label="namespace">
            <input className="probe-input" placeholder={node.name} value={f.namespace} onChange={(e) => setF({ ...f, namespace: e.target.value })} />
          </ProbeField>
        )}
        {type === 'proxmox' && (
          <>
            <ProbeField label={t('nd.pveNodeLbl', { defaultValue: 'PVE node' })}>
              <input className="probe-input" placeholder="pve" value={f.pveNode} onChange={(e) => setF({ ...f, pveNode: e.target.value })} />
            </ProbeField>
            <ProbeField label="host">
              <input className="probe-input" placeholder={hostPh} value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} />
              {manualIp && (
                <button type="button" className="probe-chip" onClick={useNodeIp('host')} title={t('nd.useNodeIp', { defaultValue: "use this node's IP" })}>
                  {t('nd.useNodeIp', { defaultValue: "use node IP" })}
                </button>
              )}
            </ProbeField>
          </>
        )}
        {type === 'system' && (
          <>
            <ProbeField label="host">
              <input className="probe-input" placeholder={hostPh} value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} />
              {manualIp && (
                <button type="button" className="probe-chip" onClick={useNodeIp('host')} title={t('nd.useNodeIp', { defaultValue: "use this node's IP" })}>
                  {t('nd.useNodeIp', { defaultValue: "use node IP" })}
                </button>
              )}
            </ProbeField>
            <ProbeField label="port">
              <input className="probe-input" placeholder="9100" inputMode="numeric" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} />
            </ProbeField>
          </>
        )}
      </div>
      {test && (
        <div className={`probe-test ${test === 'running' ? '' : `probe-test--${test.status}`}`}>
          {test === 'running'
            ? t('nd.testing', { defaultValue: 'testing…' })
            : `${test.status}${typeof test.latencyMs === 'number' ? ` · ${test.latencyMs}ms` : ''}${test.message ? ` · ${test.message}` : ''}`}
        </div>
      )}
      {msg && <div className="probe-msg">{msg}</div>}
      <div className="probe-actions">
        <button className="probe-btn" onClick={runTest}>{t('nd.testConnection', { defaultValue: 'test' })}</button>
        {probe && (
          <button className="probe-btn probe-btn--danger" onClick={remove}>{t('nd.removeMonitoring', { defaultValue: 'remove' })}</button>
        )}
        <span className="probe-spacer" />
        <button
          className={`probe-btn probe-btn--save ${justSaved ? 'probe-btn--saved' : ''}`}
          onClick={save}
          disabled={busy || justSaved}
        >
          {justSaved
            ? t('nd.savedMonitoring', { defaultValue: 'monitoring saved ✓' })
            : busy
              ? t('nd.savingMonitoring', { defaultValue: 'saving monitoring…' })
              : t('nd.saveMonitoring', { defaultValue: 'save monitoring' })}
        </button>
      </div>
    </div>
  );
}

// Wrap ProbeControl with a gallery-detail section header so it reads as a
// distinct "Monitoring" block inside the card detail view. Exported so the
// single CardGallery instance owned by App.tsx can pass it as
// renderDetailExtra for the CURRENT type's card.
export function MonitoringSlot({ node, updateNode, aspect = 'infra' }: { node: any; updateNode: any; aspect?: string }) {
  const { t } = useTranslation();
  return (
    <div className="gallery-detail-monitoring">
      <div className="gallery-detail-fields-h">{t('nd.galleryMonitoring', { defaultValue: 'Monitoring' })}</div>
      <ProbeControl node={node} updateNode={updateNode} aspect={aspect} />
    </div>
  );
}

export function NodeDetail({ nodeId, onJumpNode, onOpenRunbook, onIdChange, onOpenInfraGallery, onOpenSoftwareGallery }) {
  const { t } = useTranslation();
  const { NODES, RUNBOOKS, EDGES, getOverride, setOverride, updateNode, renameNode, deleteEdge } = useSorack();
  const node = NODES[nodeId];

  // ★ All hooks must run unconditionally before any early return — otherwise
  // a node transition (idAuto ↔ normal, or missing → present) changes the
  // hook count between renders and React throws "Rendered fewer hooks…",
  // which blanks the whole panel. Keep the hooks block above ALL returns.
  const [override, setOv] = useStateD(() => getOverride(nodeId, 'description'));
  const [editing, setEditing] = useStateD(false);
  const [draft, setDraft] = useStateD(override ?? node?.description ?? '');
  useEffectD(() => {
    setOv(getOverride(nodeId, 'description'));
    setDraft(getOverride(nodeId, 'description') ?? node?.description ?? '');
    setEditing(false);
  }, [nodeId, node?.description]);
  // Spec defaults to showing the full type template (every declared field,
  // empty included) so the user sees what to fill; toggle collapses to only
  // fields that have a value.
  const [showAll, setShowAll] = useStateD(true);
  if (!node) return null;
  // Fresh placeholder (meta.idAuto) — take the user through a 4-field setup
  // (name / id / type / software). The normal detail body returns once
  // renameNode commits and idAuto drops.
  if (node.meta?.idAuto) {
    return <NewNodeSetup node={node} updateNode={updateNode} renameNode={renameNode} allNodes={Object.values(NODES)} onIdChange={onIdChange} />;
  }
  const children = (node.children || []).map(id => NODES[id]).filter(Boolean);

  // Descendants can't be this node's parent: it would make a cycle, and a
  // subtree already moves with its root (drag-reparent on the map). So the
  // parent dropdown lists everything EXCEPT self + descendants.
  const descendantIds = new Set<string>();
  {
    const stack = [...(node.children || [])];
    while (stack.length) {
      const id = stack.pop();
      if (!id || descendantIds.has(id)) continue;
      descendantIds.add(id);
      const c = NODES[id];
      if (c?.children) stack.push(...c.children);
    }
  }

  // Phase 3D relationships: non-tree edges touching this node, split into
  // outgoing (this node → other) and incoming (other → this node) so the
  // direction of "depends/mounts/routes" reads correctly. The map only
  // shows these on selection-focus; here they're always spelled out, with
  // click-to-jump + a delete affordance.
  const relOut = (EDGES || []).filter((e) => e.sourceId === nodeId && e.type !== 'contains' && NODES[e.targetId]);
  const relIn  = (EDGES || []).filter((e) => e.targetId === nodeId && e.type !== 'contains' && NODES[e.sourceId]);

  // Description editor + showAll hooks live at the top of the function so
  // their order is stable across idAuto transitions (see ★ note above).
  const value = override ?? node.description ?? '';

  // Active issues surfaced from observed (collector-owned) data: a failed
  // probe, or any not-ready k8s workload. Replaces the old always-empty stub.
  const obsHealth = node.meta?.observed?.health;
  const issues: string[] = [];
  if (obsHealth?.status === 'err') issues.push(obsHealth.message || 'probe failed');
  for (const w of (node.meta?.observed?.k8s?.workloads || [])) {
    if (w.status === 'err' || w.status === 'warn') issues.push(`${w.name} · ${w.status}`);
  }

  return (
    <>

      {/* B-3: StatusLine reads infra + software observed bags. The ⚙ entry
          point routes to the corresponding gallery — infra (current type)
          or software (the picked swId). Pill row under the line picks the
          primary aspect (writes meta.statusPrimary). */}
      <StatusLine
        node={node}
        updateNode={updateNode}
        onOpenSettings={(aspect) => {
          if (aspect === 'infra') onOpenInfraGallery?.(node.kind || node.type);
          else onOpenSoftwareGallery?.(aspect);
        }}
      />

      {issues.length > 0 && (
        <div className="nd-warn">
          <div className="nd-warn-h">{t('nd.activeIssues')}</div>
          {issues.map((w, i) => <div key={i} className="nd-warn-line">{w}</div>)}
        </div>
      )}

      {/* Summary widgets (gauges / counts) sit up top: the live observed state
          is the point of the panel. The detailed workload list goes BELOW the
          spec. Self-hide until their source has data. */}
      <TypeWidgets node={node} only={['gauges', 'countGrid']} />

      <section className="nd-section">
        <div className="nd-section-h">
          <span>{t('nd.spec')}</span>
          <button className="nd-spec-toggle" onClick={() => setShowAll((s) => !s)}>
            {showAll ? t('nd.collapseEmpty', { defaultValue: 'hide empty' }) : t('nd.showAllFields', { defaultValue: 'show all' })}
          </button>
        </div>
        <div className="specs">
          {/* Status now lives in the top status line (see StatusLine); name +
              type live in the sheet header. Parent + type fields sit here. */}
          <EditableSpecRow
            k={t('nodeForm.parent')}
            value={node.parentId || ''}
            display={node.parentId ? (NODES[node.parentId]?.name || node.parentId) : t('nodeForm.parentNone')}
            onSave={(v) => updateNode(node.id, { parentId: v || null })}
            renderEditor={(draft, _setDraft, commit, cancel) => {
              // Custom Dropdown (vs native <select>): shows the type icon
              // alongside each candidate, and the id as a muted secondary
              // string so same-named nodes are distinguishable. The picker
              // excludes self + descendants (would form a parent cycle).
              const opts = [
                { value: '', label: t('nodeForm.parentNone') as string },
                ...Object.values(NODES)
                  .filter((n: any) => n.id !== node.id && !descendantIds.has(n.id))
                  .sort((a: any, b: any) => (a.name || a.id).localeCompare(b.name || b.id))
                  .map((n: any) => ({
                    value: n.id,
                    label: n.name || n.id,
                    description: n.id,
                    icon: <NodeIcon kind={n.kind || n.type || 'svc'} size={14} />,
                  })),
              ];
              return (
                <Dropdown
                  value={draft ?? ''}
                  onChange={(v) => commit(v)}
                  options={opts}
                  ariaLabel={t('nodeForm.parent') as string}
                  className="spec-v-dropdown"
                  // Dismiss (click outside / Esc) exits edit mode — without
                  // this the row stayed in editing state even after the
                  // menu closed, and Esc bubbled up to close the whole sheet.
                  onClose={cancel}
                />
              );
            }}
          />
          {/* id is auto-generated and immutable — hide from the panel
              entirely. The system uses it for refs; the user doesn't
              need to see it. */}

          {/* Type-specific spec rows merged in right after parent, driven by
              the schema in node-detail-schema.ts. showAll renders the full
              type template (empty fields included). */}
          <TypeSpecRows node={node} updateNode={updateNode} showAll={showAll} />
        </div>
      </section>

      {/* Axis 2: one section per software the node runs (+ "+ software"). */}
      <SoftwareSections
        node={node}
        updateNode={updateNode}
        showAll={showAll}
        onConfigureSoftware={(swId) => onOpenSoftwareGallery?.(swId)}
      />

      {/* Detailed workload list sits below the spec (point 5) — it's the long,
          drill-down view, not a glanceable summary. */}
      <TypeWidgets node={node} only={['workloadList']} />

      <section className="nd-section">
        <div className="nd-section-h">
          <span>{t('nd.notesTags')}</span>
        </div>
        {/* Tag editor — chip row + Add input with autocomplete. Lives inside
            the existing notes·tags section so all node labels (tags + free
            text notes) are co-located. */}
        <TagsEditor node={node} updateNode={updateNode} />
        {editing ? (
          <div className="nd-desc">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              style={{ width: '100%', background: 'var(--surface-1)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: 10, fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1.5, outline: 'none', resize: 'vertical' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={{ padding: '6px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-3)', border: '1px solid var(--border)', borderRadius: 3, minWidth: 0, minHeight: 0 }} onClick={() => { setDraft(value); setEditing(false); }}>{t('action.cancel')}</button>
              <button style={{ padding: '6px 12px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, background: 'var(--primary)', color: 'var(--on-primary)', borderRadius: 3, minWidth: 0, minHeight: 0 }} onClick={() => { setOverride(nodeId, 'description', draft); setOv(draft); setEditing(false); }}>{t('action.save')}</button>
            </div>
          </div>
        ) : (
          <div className={`nd-desc ${!value ? 'nd-desc--empty' : ''}`} onClick={() => setEditing(true)}>
            {value || t('nd.descEmpty')}
          </div>
        )}
      </section>

      {children.length > 0 && (
        <section className="nd-section">
          <div className="nd-section-h">
            <span>{t('nd.contains')} <span className="nd-section-c">{children.length}</span></span>
          </div>
          <div className="nd-children">
            {children.map(c => (
              <button key={c.id} className="nd-child" onClick={() => onJumpNode(c.id)}>
                <span className="nd-child-icon"><NodeIcon kind={c.kind} size={14} /></span>
                <span className="nd-child-name">{c.name}</span>
                <span className="nd-child-kind">{c.kind}</span>
                <StatusDot status={c.status} />
              </button>
            ))}
          </div>
        </section>
      )}

      {(relOut.length > 0 || relIn.length > 0) && (
        <section className="nd-section">
          <div className="nd-section-h">
            <span>{t('nd.relationships')} <span className="nd-section-c">{relOut.length + relIn.length}</span></span>
          </div>
          <div className="nd-rels">
            {relOut.map((e) => {
              const other = NODES[e.targetId];
              return (
                <div key={`out-${e.id}`} className="nd-rel">
                  <span className={`nd-rel-verb nd-rel-verb--${e.type}`}>{t(`edgeActions.verb.${e.type}`, { defaultValue: e.type })}</span>
                  <button className="nd-rel-node" onClick={() => onJumpNode(e.targetId)}>
                    <span className="nd-child-icon"><NodeIcon kind={other.kind} size={14} /></span>
                    <span className="nd-child-name">{other.name}</span>
                    <StatusDot status={other.status} />
                  </button>
                  <button className="nd-rel-del" onClick={() => deleteEdge(e.id).catch((err) => console.error(err))} aria-label={t('edgeActions.delete')}>✕</button>
                </div>
              );
            })}
            {relIn.map((e) => {
              const other = NODES[e.sourceId];
              return (
                <div key={`in-${e.id}`} className="nd-rel nd-rel--in">
                  <button className="nd-rel-node" onClick={() => onJumpNode(e.sourceId)}>
                    <span className="nd-child-icon"><NodeIcon kind={other.kind} size={14} /></span>
                    <span className="nd-child-name">{other.name}</span>
                    <StatusDot status={other.status} />
                  </button>
                  <span className={`nd-rel-verb nd-rel-verb--${e.type}`}>{t(`edgeActions.verb.${e.type}`, { defaultValue: e.type })}</span>
                  <button className="nd-rel-del" onClick={() => deleteEdge(e.id).catch((err) => console.error(err))} aria-label={t('edgeActions.delete')}>✕</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {node.runbooks && node.runbooks.length > 0 && (
        <section className="nd-section">
          <div className="nd-section-h">
            <span>{t('nd.relatedRunbooks')}</span>
          </div>
          <div className="nd-runbooks">
            {node.runbooks.map(rid => {
              const rb = RUNBOOKS[rid]; if (!rb) return null;
              return (
                <button key={rid} className="nd-runbook" onClick={() => onOpenRunbook(rid)}>
                  <span className="nd-rb-cat">{rb.category}</span>
                  <span className="nd-rb-title">{rb.title}</span>
                  <span className={`nd-rb-state nd-rb-state--${rb.state}`}>{t(`runbook.state.${rb.state}`, { defaultValue: rb.state })}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

    </>
  );
}

// ─── Runbook full-screen viewer ────────────────────────────────────
// Headline ref row — used twice in the runbook head (nodes + related
// runbooks). Pure presentation; the caller computes options and supplies
// callbacks for add/remove/jump. Defined outside RunbookScreen because
// per-render new component types remount inputs and steal focus.
function RefsRow({ label, items, options, onAdd, onRemove, onJump }: {
  label: string;
  items: { id: string; label: string }[];
  options: { id: string; label: string }[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onJump: (id: string) => void;
}) {
  const known = new Set(items.map((it) => it.id));
  const available = options.filter((o) => !known.has(o.id));
  if (items.length === 0 && available.length === 0) return null;
  return (
    <div className="rb-refs-row">
      <span className="rb-refs-label">{label}</span>
      <div className="rb-refs-chips">
        {items.map((it) => (
          <span key={it.id} className="rb-ref-chip">
            <button className="rb-ref-chip-jump" onClick={() => onJump(it.id)} title={it.id}>{it.label}</button>
            <button className="rb-ref-chip-x" onClick={() => onRemove(it.id)} aria-label="remove">×</button>
          </span>
        ))}
        {available.length > 0 && (
          <Dropdown
            className="rb-ref-add"
            value=""
            options={available.map((o) => ({ value: o.id, label: o.label, description: o.id }))}
            onChange={(id) => onAdd(id)}
            placeholder="+"
          />
        )}
      </div>
    </div>
  );
}

export function RunbookScreen({ runbookId, onClose, onJumpNode, onJumpRunbook }) {
  const { t } = useTranslation();
  const { NODES, RUNBOOKS, createRunbook, updateRunbook, deleteRunbook } = useSorack();
  const [showTree, setShowTree] = useStateD(!runbookId);
  const [editingTitle, setEditingTitle] = useStateD(false);
  const [deleteOpen, setDeleteOpen] = useStateD(false);
  const tplQ = useQueryD({ queryKey: ["runbook-templates"], queryFn: fetchRunbookTemplates, staleTime: 5 * 60_000 });
  const templates: ApiRunbookTemplate[] = tplQ.data ?? [];
  const [titleDraft, setTitleDraft] = useStateD('');
  const [editingSummary, setEditingSummary] = useStateD(false);
  const [summaryDraft, setSummaryDraft] = useStateD('');

  const rb = runbookId ? RUNBOOKS[runbookId] : null;

  const handleCreate = async ({ title, templateId }: { title: string; templateId: string }) => {
    const tpl = templates.find((t) => t.id === templateId);
    const payload: any = { title };
    if (tpl) {
      if (tpl.category) payload.category = tpl.category;
      if (tpl.summary) payload.summary = tpl.summary;
      if (tpl.markdown) payload.markdown = tpl.markdown;
    }
    const r = await createRunbook(payload);
    onJumpRunbook(r.id);
    setShowTree(false);
  };

  const handleDelete = async () => {
    if (!rb) return;
    await deleteRunbook(rb.id);
    setDeleteOpen(false);
    onJumpRunbook(''); // navigate back to list
    setShowTree(true);
  };

  const startTitleEdit = () => { if (rb) { setTitleDraft(rb.title); setEditingTitle(true); } };
  const commitTitle = async () => {
    if (!rb) return;
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === rb.title) return;
    await updateRunbook(rb.id, { title: next });
  };
  const startSummaryEdit = () => { if (rb) { setSummaryDraft(rb.summary ?? ''); setEditingSummary(true); } };
  const commitSummary = async () => {
    if (!rb) return;
    const next = summaryDraft.trim();
    setEditingSummary(false);
    if (next === (rb.summary ?? '')) return;
    await updateRunbook(rb.id, { summary: next });
  };

  return (
    <div className="fs-overlay rb-fs">
      <header className="fs-head">
        <button className="fs-back" onClick={onClose} aria-label={t('action.back')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <div className="fs-title">{rb && !showTree ? rb.title : t('runbook.title')}</div>
      </header>

      <div className={`rb-list-wrap ${showTree || !rb ? '' : 'rb-list-wrap--hidden-on-mobile'}`}>
        <RunbookList
          runbookId={runbookId ?? null}
          runbooks={RUNBOOKS}
          templates={templates}
          onJumpRunbook={(id) => { onJumpRunbook(id); setShowTree(false); }}
          onCreate={handleCreate}
        />
      </div>

      {rb && !showTree && (
        <div className="rb-article-wrap" style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="rb-article-head">
            <div className="rb-meta-row">
              <Dropdown
                className="rb-meta-pick rb-meta-pick--cat"
                ariaLabel={t('runbook.category.label', { defaultValue: 'category' })}
                value={rb.category}
                options={['task','sop','incident','postmortem','design_doc'].map(c => ({
                  value: c,
                  label: t(`runbook.category.${c}`, { defaultValue: c }),
                  icon: <CategoryIcon cat={c} />,
                }))}
                onChange={(v) => updateRunbook(rb.id, { category: v as any })}
              />
              <Dropdown
                className={`rb-meta-pick rb-meta-state rb-meta-state--${rb.state}`}
                ariaLabel={t('runbook.state.label', { defaultValue: 'status' })}
                value={rb.state}
                options={['planned','in_progress','completed','rolled_back'].map(s => ({
                  value: s,
                  label: t(`runbook.state.${s}`, { defaultValue: s }),
                }))}
                onChange={(v) => updateRunbook(rb.id, { status: v as any })}
              />
              <span className="rb-meta-date">{t('runbook.updated', { date: rb.updated })}</span>
              <button className="rb-head-del" onClick={() => setDeleteOpen(true)} title={t('action.delete', { defaultValue: 'Delete' })} aria-label="delete">
                <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h10M7 5V3.5h4V5M5.5 5l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" />
                </svg>
              </button>
            </div>
            {editingTitle ? (
              <input
                className="rb-h1 rb-h1--input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                  else if (e.key === 'Escape') { setEditingTitle(false); }
                }}
                autoFocus
              />
            ) : (
              <h1 className="rb-h1" onDoubleClick={startTitleEdit} title="double-click to edit">{rb.title}</h1>
            )}
            {editingSummary ? (
              <input
                className="rb-summary rb-summary--input"
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                onBlur={commitSummary}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitSummary(); }
                  else if (e.key === 'Escape') { setEditingSummary(false); }
                }}
                placeholder={t('runbook.summaryPlaceholder', { defaultValue: 'one-line summary…' })}
                autoFocus
              />
            ) : (
              <div
                className={`rb-summary ${!rb.summary ? 'rb-summary--empty' : ''}`}
                onDoubleClick={startSummaryEdit}
                title="double-click to edit"
              >
                {rb.summary || t('runbook.summaryEmpty', { defaultValue: '(no summary)' })}
              </div>
            )}
            <RefsRow
              label={t('runbook.refs.nodes', { defaultValue: 'nodes' })}
              items={((rb.nodeRefs ?? []) as string[]).map((id) => ({ id, label: NODES[id]?.name ?? id }))}
              options={Object.values(NODES).map((n: any) => ({ id: n.id, label: n.name ?? n.id }))}
              onAdd={(id) => updateRunbook(rb.id, { nodeRefs: [...((rb.nodeRefs ?? []) as string[]), id] })}
              onRemove={(id) => updateRunbook(rb.id, { nodeRefs: ((rb.nodeRefs ?? []) as string[]).filter((x) => x !== id) })}
              onJump={onJumpNode}
            />
            <RefsRow
              label={t('runbook.refs.runbooks', { defaultValue: 'related' })}
              items={((rb.meta?.runbookRefs ?? []) as string[]).map((id) => ({ id, label: RUNBOOKS[id]?.title ?? id }))}
              options={Object.values(RUNBOOKS).filter((r: any) => r.id !== rb.id).map((r: any) => ({ id: r.id, label: r.title ?? r.id }))}
              onAdd={(id) => updateRunbook(rb.id, { meta: { runbookRefs: [...((rb.meta?.runbookRefs ?? []) as string[]), id] } as any })}
              onRemove={(id) => updateRunbook(rb.id, { meta: { runbookRefs: ((rb.meta?.runbookRefs ?? []) as string[]).filter((x) => x !== id) } as any })}
              onJump={onJumpRunbook}
            />
          </div>
          <RunbookEditor
            runbookId={rb.id}
            initialContent={rb.md ?? ''}
            previewRender={(md) => renderMarkdown(md, (id) => { onJumpNode(id); }, onJumpRunbook, NODES, RUNBOOKS)}
            onSave={(md) => updateRunbook(rb.id, { markdown: md })}
            mentions={{
              nodes: Object.values(NODES).map((n: any) => ({ id: n.id, label: n.name ?? n.id })),
              runbooks: Object.values(RUNBOOKS).filter((r: any) => r.id !== rb.id).map((r: any) => ({ id: r.id, label: r.title ?? r.id })),
            }}
          />
        </div>
      )}
      <ConfirmDialog
        open={deleteOpen && !!rb}
        title={t('runbook.deleteTitle', { defaultValue: 'Delete runbook?' })}
        message={t('runbook.deleteConfirm', { title: rb?.title ?? '', defaultValue: `Delete "${rb?.title ?? ''}"? This removes the file from disk.` })}
        confirmLabel={t('action.delete', { defaultValue: 'Delete' })}
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

