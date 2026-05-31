// @ts-nocheck — Phase 4 marker (lab mockup migration).

// lab-app.jsx — main responsive app shell.

import * as React from "react";
import { useState as useStateA, useEffect as useEffectA, useRef as useRefA, useMemo as useMemoA, useCallback as useCallbackA } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSorack } from "@/lib/data-source/SorackData";
// Edge types the operator can pick from the connect/edit menus. Keep in
// sync with TopologyFlow's EDGE_STYLES; new keys here automatically get
// a fallback dashed style if they don't have one yet.
const EDGE_TYPE_CHOICES = ["depends", "mounts", "routes"] as const;
import { useIsDesktop } from "@/lib/use-is-desktop";
import { ActionMenu, ConfirmDialog, type ActionMenuItem } from "@/features/node-form/NodeActions";
import { history } from "@/lib/history";
import { TopologyFlow } from "@/features/topology-flow/TopologyFlow";
import { NodeDetail, RunbookScreen, EditableHeaderName, EditableHeaderType, HeaderIcon, MonitoringSlot, buildInfraGalleryItems, commitInfraType } from "@/features/lab/LabDetail";
import { softwareForInfra, softwareIds } from "@/features/lab/node-detail-schema";
import { CardGallery, type CardItem } from "@/features/lab/CardGallery";
import { SettingsView } from "@/features/settings/SettingsView";
import { NodeIcon } from "@/components/icons/NodeIcon";
import { tagColor } from "@/lib/tag-color";
import { TagChip } from "@/components/TagChip";
import { Dropdown } from "@/components/Dropdown";
import { useKeyboardShortcuts, isTypingEl } from "@/lib/use-keyboard-shortcuts";
import { slugify, uniqueSlug } from "@/lib/slug";
import { siblingSort, appendToSiblings } from "@/lib/sort";

// ─── Icons ─────────────────────────────────────────────────────────
const Ic = {
  menu: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 7h14M4 11h14M4 15h14" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="10" r="6" />
      <path d="M15 15l4 4" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 16h12l-1.5-2v-4a4.5 4.5 0 1 0-9 0v4L5 16z" />
      <path d="M9 18.5a2 2 0 0 0 4 0" />
    </svg>
  ),
  moon: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 11A5.5 5.5 0 0 1 7 3.5a6 6 0 1 0 7.5 7.5z" />
    </svg>
  ),
  sun: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="9" r="3.2" />
      <path d="M9 1.8v1.6M9 14.6v1.6M16.2 9h-1.6M3.4 9H1.8M14.1 3.9l-1.1 1.1M5 13l-1.1 1.1M14.1 14.1l-1.1-1.1M5 5L3.9 3.9" />
    </svg>
  ),
  close: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 5l12 12M17 5L5 17" />
    </svg>
  ),
  book: (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h10a2 2 0 0 1 2 2v12H7a2 2 0 0 1-2-2V4z" />
      <path d="M5 16a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M11 4v14M4 11h14" />
    </svg>
  ),
  kebab: (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="currentColor">
      <circle cx="11" cy="5" r="1.7" /><circle cx="11" cy="11" r="1.7" /><circle cx="11" cy="17" r="1.7" />
    </svg>
  ),
  pencil: (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14.5V16h1.5L13 7.5 11.5 6 3 14.5z" />
      <path d="M12 5.5l1.5-1.5 1.5 1.5L13.5 7" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h10M7 5V3.5h4V5M5.5 5l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="9" height="9" rx="1.5" />
      <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12" />
    </svg>
  ),
  up: (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14V4M4 8.5l5-5 5 5" />
    </svg>
  ),
  undo: (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 6L3 10l4 4" />
      <path d="M3 10h9a6 6 0 0 1 0 12H8" />
    </svg>
  ),
  chevL: (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5l-5 6 5 6" />
    </svg>
  ),
  chevR: (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l5 6-5 6" />
    </svg>
  ),
  redo: (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l4 4-4 4" />
      <path d="M19 10h-9a6 6 0 0 0 0 12h4" />
    </svg>
  ),
  gear: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

// ─── TopBar ────────────────────────────────────────────────────────
function TopBar({ onMenu, onSearch, onAlerts, alertsCount, breadcrumb, onCrumb, onRunbooks, mode }) {
  const { t } = useTranslation();
  const crumbsRef = useRefA(null);
  const dragRef = useRefA(null);
  const movedRef = useRefA(false);

  // Drag-to-scroll the breadcrumb. Scrollbar is hidden (cleaner topbar);
  // dragging anywhere in the strip pans it horizontally. Click-through
  // still works because pointerdown→up without movement leaves moved=false,
  // which lets the crumb button's onClick fire normally.
  const onCrumbsPointerDown = (e) => {
    if (e.button !== 0) return;
    const el = crumbsRef.current; if (!el) return;
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft };
    movedRef.current = false;
    const onMove = (ev) => {
      const st = dragRef.current; if (!st) return;
      const dx = ev.clientX - st.startX;
      if (Math.abs(dx) > 3) movedRef.current = true;
      if (movedRef.current) {
        el.scrollLeft = st.startScroll - dx;
        el.classList.add('topbar-crumbs--dragging');
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      el.classList.remove('topbar-crumbs--dragging');
      dragRef.current = null;
      // Hold moved=true for one frame so the bubbling click is suppressed,
      // then clear so the next gentle tap works.
      setTimeout(() => { movedRef.current = false; }, 0);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };
  const onCrumbsClickCapture = (e) => {
    if (movedRef.current) { e.preventDefault(); e.stopPropagation(); }
  };

  return (
    <header className="topbar">
      <button className="topbar-menu" onClick={onMenu} aria-label={t('action.menu')}>{Ic.menu}</button>
      <div className="topbar-brand">
        <div className="topbar-mark" />
        <div className="topbar-brand-text">
          <div className="topbar-brand-name">sorack</div>
          <div className="topbar-brand-sub">control plane</div>
        </div>
      </div>
      {/* Desktop-only crumbs (own column, sits right of the brand border) */}
      <nav
        ref={crumbsRef}
        className="topbar-crumbs"
        onPointerDown={onCrumbsPointerDown}
        onClickCapture={onCrumbsClickCapture}
      >
        {breadcrumb.length === 0 ? (
          <button className="crumb crumb--cur"><span className="crumb-kind">view</span><span className="crumb-name">map</span></button>
        ) : breadcrumb.map((n, i) => (
          <React.Fragment key={n.id}>
            {i > 0 && <span className="crumb-sep">/</span>}
            <button className={`crumb ${i === breadcrumb.length - 1 ? 'crumb--cur' : ''}`} onClick={() => onCrumb(n.id)}>
              <span className="crumb-kind">{n.kind}</span>
              <span className="crumb-name">{n.name}</span>
            </button>
          </React.Fragment>
        ))}
      </nav>
      <div className="topbar-actions">
        <button
          className="topbar-icon-btn"
          onClick={onSearch}
          aria-label={t('search.title')}
          title={`${t('search.title')} (⌘K)`}
        >{Ic.search}</button>
        <button className="topbar-icon-btn" onClick={onRunbooks} aria-label={t('runbook.title')}>{Ic.book}</button>
        <button className="topbar-icon-btn" onClick={onAlerts} aria-label={t('alerts.title')}>
          {Ic.bell}
          {alertsCount.err > 0 && <span className="alert-badge">{alertsCount.err}</span>}
          {alertsCount.err === 0 && alertsCount.warn > 0 && <span className="alert-badge alert-badge--warn">{alertsCount.warn}</span>}
        </button>
      </div>
    </header>
  );
}

// ─── Filter bar (desktop) ──────────────────────────────────────────
// Inline search + filter surface that replaces the old top-bar filter strip
// AND the desktop SearchOverlay modal. Two states:
//   - collapsed: just the active filter chips (when any) — small, unobtrusive
//   - expanded: search input + chips + facet picker + runbook results inline
// The expansion animates down + fades in; sidebar tree narrows live as the
// user types. Mobile keeps the existing SearchOverlay modal.
function FilterBar({
  open, onOpenChange,
  searchQuery, onSearchQueryChange,
  activeTags, availableTags, onAddTag, onRemoveTag,
  onClearAll, hasActiveFilters,
  runbookResults, onPickRunbook,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  activeTags: string[];
  availableTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  runbookResults: Array<{ id: string; label: string; sub: string }>;
  onPickRunbook: (id: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRefA<HTMLInputElement>(null);
  // Focus the input as soon as the bar expands.
  useEffectA(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  // Bar is hidden entirely only when collapsed AND no active filters AND no
  // tags in the system at all — nothing to show.
  if (!open && !hasActiveFilters) return null;
  const pickable = availableTags.filter((tg) => !activeTags.includes(tg));
  return (
    <div className={`filter-bar ${open ? 'filter-bar--open' : 'filter-bar--collapsed'}`}>
      {/* Always-on chip row + picker — visible whether collapsed or expanded. */}
      <div className="filter-bar-chips">
        <span className="filter-bar-lbl">{t('filter.tagsLabel', { defaultValue: 'filter' })}</span>
        {activeTags.map((tag) => (
          <TagChip key={tag} value={tag} onRemove={() => onRemoveTag(tag)} active />
        ))}
        {pickable.length > 0 && (
          <Dropdown
            value=""
            placeholder={t('filter.addTag', { defaultValue: '+ filter' })}
            options={pickable.map((tg) => ({ value: tg, label: tg }))}
            onChange={(v) => v && onAddTag(v)}
            className="filter-picker"
            ariaLabel={t('filter.addTag', { defaultValue: '+ filter' })}
          />
        )}
        {hasActiveFilters && (
          <button type="button" className="filter-row-clear" onClick={onClearAll}>
            {t('filter.clear', { defaultValue: 'clear' })}
          </button>
        )}
        {open && (
          <button
            type="button"
            className="filter-bar-close"
            onClick={() => onOpenChange(false)}
            aria-label={t('action.close', { defaultValue: 'close' })}
          >
            ✕
          </button>
        )}
      </div>

      {/* Search input + runbook results — expanded only. Search icon prefix
          matches the mobile modal's search-input-wrap pattern. */}
      {open && (
        <>
          <div className="filter-bar-input-wrap">
            <span className="filter-bar-input-icon" aria-hidden="true">{Ic.search}</span>
            <input
              ref={inputRef}
              className="filter-bar-input"
              placeholder={t('search.placeholder', { defaultValue: 'search nodes, runbooks…' })}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onOpenChange(false); }}
            />
          </div>
          {runbookResults.length > 0 && (
            <div className="filter-bar-runbooks">
              <div className="filter-bar-runbooks-h">
                {t('search.runbookHits', { defaultValue: 'Runbooks' })}
              </div>
              {runbookResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="filter-bar-runbook"
                  onClick={() => { onPickRunbook(r.id); onOpenChange(false); }}
                >
                  <span className="filter-bar-runbook-label">{r.label}</span>
                  <span className="filter-bar-runbook-sub">{r.sub}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Bulk action bar ──────────────────────────────────────────────
// Floating toast at the bottom of the map. Visible when ≥2 nodes are
// selected via Cmd/Shift+click or Cmd+drag (rubber band) on the graph.
// Actions loop per-node PATCH calls — no dedicated bulk API endpoint in v1
// (small selections, optimistic cache handles UI updates per call).
function BulkBar({
  count,
  availableTags,
  reparentTargets,
  onClear,
  onAddTag,
  onReparent,
  onDelete,
}: {
  count: number;
  availableTags: string[];
  reparentTargets: Array<{ id: string; name: string }>;
  onClear: () => void;
  onAddTag: (tag: string) => void;
  onReparent: (parentId: string | null) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bulk-bar" role="region" aria-label={t('bulk.title', { defaultValue: 'bulk actions' })}>
      <span className="bulk-bar-count">
        {t('bulk.selected', { count, defaultValue: `${count} selected` })}
      </span>
      <button
        type="button"
        className="bulk-bar-clear"
        onClick={onClear}
        title={t('bulk.clear', { defaultValue: 'clear selection' })}
        aria-label={t('bulk.clear', { defaultValue: 'clear selection' })}
      >✕</button>
      <span className="bulk-bar-sep" />
      <Dropdown
        value=""
        placeholder={t('bulk.addTag', { defaultValue: '+ tag' })}
        options={availableTags.map((tg) => ({ value: tg, label: tg }))}
        onChange={(v) => v && onAddTag(v)}
        className="bulk-bar-picker"
        ariaLabel={t('bulk.addTag', { defaultValue: '+ tag' })}
      />
      <Dropdown
        value=""
        placeholder={t('bulk.reparent', { defaultValue: 'reparent' })}
        options={[
          { value: '__root__', label: t('bulk.reparentToRoot', { defaultValue: '(make root)' }) },
          ...reparentTargets.map((n) => ({ value: n.id, label: n.name })),
        ]}
        onChange={(v) => v && onReparent(v === '__root__' ? null : v)}
        className="bulk-bar-picker"
        ariaLabel={t('bulk.reparent', { defaultValue: 'reparent' })}
      />
      <button
        type="button"
        className="bulk-bar-btn bulk-bar-btn--danger"
        onClick={onDelete}
      >
        {t('bulk.delete', { defaultValue: 'delete' })}
      </button>
    </div>
  );
}

// ─── Drawer (left) ─────────────────────────────────────────────────

// One row of the node tree. The node icon doubles as the expand/collapse
// toggle for parent nodes: it shows the type icon normally and swaps to a
// chevron (▸/▾) on hover, so there's no separate caret column. Clicking the
// name selects the node on the map. `lastChain[i]` = whether the ancestor at
// level i+1 (and finally this node) is its parent's last child — drives the
// vertical indent guides.
// Indent width for a guide cell at position i (0-indexed). Progressive
// compression keeps deep subtrees readable: shallow levels stay wide enough
// for clean visual rhythm, deeper levels tighten so node names retain
// horizontal room. Tuned for the 240–300px sidebar.
function guideWidthFor(i: number): number {
  if (i < 3) return 16;
  if (i < 6) return 12;
  return 8;
}

// Hover tooltip used by tree rows. Portal-renders to document.body so the
// drawer-tree's overflow clipping doesn't cut it off (overflow-y: auto on
// the scroller forces horizontal clipping too — CSS spec quirk). 150ms
// delay before show; clears immediately on leave. Touch devices don't fire
// mouseenter, so this is implicitly desktop-only — matching the agreement
// that mobile gets full names via click→detail instead.
function useHoverTip(text: string) {
  const [pos, setPos] = useStateA<{ x: number; y: number } | null>(null);
  const timerRef = useRefA<any>(null);
  const handlers = {
    onMouseEnter: (e: React.MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPos({ x: rect.right + 4, y: rect.top + rect.height / 2 });
      }, 150);
    },
    onMouseLeave: () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setPos(null);
    },
  };
  const portal = pos
    ? createPortal(
        <div
          className="hover-tip"
          style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateY(-50%)' }}
        >
          {text}
        </div>,
        document.body,
      )
    : null;
  return { handlers, portal };
}

function TreeItem({ id, depth, lastChain = [], NODES, getChildren, currentId, isCollapsed, onToggle, onJump, onNodeContextMenu, isDimmed, selectedIds, onSelectedIdsChange, dragInfo, onDragStartRow, onDragOverRow, onDragEndRow, onDropRow }) {
  const node = NODES[id];
  const tip = useHoverTip(node?.name ?? '');
  if (!node) return null;
  const children = getChildren(id).slice().sort(siblingSort);
  const hasChildren = children.length > 0;
  const expanded = !isCollapsed(id);
  const statusColor = node.status === 'err' ? 'var(--err)' : node.status === 'warn' ? 'var(--warn)' : node.status === 'ok' ? 'var(--ok)' : 'var(--fg-4)';
  // Right-click anywhere on the row opens the same node actions menu the
  // graph uses (rename / new child / move / delete / etc.). preventDefault
  // suppresses the native browser menu.
  const handleContextMenu = onNodeContextMenu
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onNodeContextMenu(id, { x: e.clientX, y: e.clientY });
      }
    : undefined;
  // Click semantics mirror the graph: plain click navigates + replaces
  // selection with this one node; Cmd/Ctrl/Shift+click toggles membership
  // in the multi-select set without navigating (lets the user assemble a
  // bulk selection from the sidebar too).
  const isInMulti = !!(selectedIds && selectedIds.has(id));
  const handleRowClick = (e: React.MouseEvent) => {
    const modifier = e.metaKey || e.ctrlKey || e.shiftKey;
    if (modifier && onSelectedIdsChange) {
      e.preventDefault();
      const next = new Set(selectedIds ?? new Set<string>());
      if (next.has(id)) next.delete(id); else next.add(id);
      onSelectedIdsChange(next);
      return;
    }
    onJump(id);
    onSelectedIdsChange?.(new Set([id]));
  };
  // Drop-indicator state for THIS row — three zones: before (top 1/3) and
  // after (bottom 1/3) reorder among siblings, into (middle 1/3) reparents.
  type DropPos = 'before' | 'after' | 'into';
  const dropPos: DropPos | null =
    dragInfo && dragInfo.draggedId !== id && dragInfo.over === id
      ? (dragInfo.pos as DropPos)
      : null;
  // Decide the drop zone from cursor Y inside the row. Edges (top/bottom
  // 1/3) reorder; middle 1/3 reparents.
  const classifyZone = (e: React.DragEvent): DropPos => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
    if (ratio < 1 / 3) return 'before';
    if (ratio > 2 / 3) return 'after';
    return 'into';
  };
  // Cycle guard: target row must not be a descendant of the dragged node
  // (would create a parentage loop on reparent).
  const isDescendantOfDragged = (targetId: string, draggedId: string): boolean => {
    let cur: string | null = targetId;
    while (cur) {
      if (cur === draggedId) return true;
      cur = NODES[cur]?.parentId ?? null;
    }
    return false;
  };
  const handleDragStart = (e: React.DragEvent) => {
    if (!onDragStartRow) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    e.stopPropagation();
    onDragStartRow(id);
  };
  // Resolve drop zone with cross-parent fallback applied. Used by both
  // dragover (visual indicator) and drop (actual commit) so they agree on
  // intent — otherwise drop computed a different zone than the user saw,
  // and cross-parent drops in sibling zones silently no-op'd.
  const resolveDropPos = (e: React.DragEvent): DropPos | null => {
    if (!dragInfo) return null;
    const dragged = NODES[dragInfo.draggedId];
    if (!dragged) return null;
    let pos = classifyZone(e);
    if (pos !== 'into' && (dragged.parentId ?? null) !== (node.parentId ?? null)) {
      pos = 'into';
    }
    return pos;
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!onDragOverRow || !dragInfo) return;
    if (dragInfo.draggedId === id) return; // can't drop on self
    if (isDescendantOfDragged(id, dragInfo.draggedId)) return; // cycle gate
    const pos = resolveDropPos(e);
    if (!pos) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragInfo.over !== id || dragInfo.pos !== pos) onDragOverRow(id, pos);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!onDropRow || !dragInfo) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = resolveDropPos(e);
    if (!pos) return;
    onDropRow(id, pos);
  };
  return (
    <>
      <div
        className={
          `tree-row ${id === currentId ? 'tree-row--cur' : ''}` +
          ` ${isInMulti ? 'tree-row--multi' : ''}` +
          ` ${isDimmed && isDimmed(id) ? 'tree-row--dim' : ''}` +
          ` ${dropPos === 'before' ? 'tree-row--drop-before' : ''}` +
          ` ${dropPos === 'after' ? 'tree-row--drop-after' : ''}` +
          ` ${dropPos === 'into' ? 'tree-row--drop-into' : ''}` +
          ` ${dragInfo?.draggedId === id ? 'tree-row--dragging' : ''}`
        }
        draggable={!!onDragStartRow}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={() => onDragEndRow?.()}
        onClick={handleRowClick}
        onContextMenu={handleContextMenu}
        {...tip.handlers}
      >
        {lastChain.map((isLast, i) => {
          const connector = i === lastChain.length - 1;
          const kind = connector ? (isLast ? 'corner' : 'branch') : (isLast ? 'empty' : 'vertical');
          // --tg-w (cell width) drives the guide column AND its centered
          // vertical line (left = calc(var(--tg-w) / 2)). Deeper guides are
          // narrower so deep node names still get usable horizontal room.
          const w = guideWidthFor(i);
          return (
            <span key={i} className={`tree-guide tree-guide--${kind}`}
              style={{ ['--tg-w' as any]: `${w}px` }} />
          );
        })}
        {hasChildren ? (
          <button
            className="tree-iconbtn"
            onClick={(e) => { e.stopPropagation(); onToggle(id); }}
            aria-label={expanded ? 'collapse' : 'expand'}
          >
            <span className="tree-iconbtn-icon"><NodeIcon kind={node.kind || 'svc'} size={13} /></span>
            <span className={`tree-iconbtn-caret ${expanded ? 'tree-iconbtn-caret--open' : ''}`}>▸</span>
          </button>
        ) : (
          <span className="tree-iconbtn tree-iconbtn--leaf"><NodeIcon kind={node.kind || 'svc'} size={13} /></span>
        )}
        <button className="tree-label" onClick={(e) => { e.stopPropagation(); handleRowClick(e); }}>
          <span className="tree-name">{node.name}</span>
          {/* Tag indicators — outlined ring dots in the tag's hash color, up
              to 2 per row. Outlined ring (not filled) so they read clearly
              apart from the solid status dot. Tooltip = tag value; full set
              + edit live in the detail panel. */}
          {(node.tags ?? []).slice(0, 2).map((tag: string) => {
            const c = tagColor(tag);
            return (
              <span
                key={tag}
                className="tag-dot"
                style={{ borderColor: c.fg, background: c.bg }}
                title={tag}
              />
            );
          })}
          {node.meta?.maintenance ? (
            <span className="tree-dot tree-dot--maint" title="in maintenance" aria-label="in maintenance">⏸</span>
          ) : (
            <span className="tree-dot" style={{ background: statusColor }} />
          )}
        </button>
        {tip.portal}
      </div>
      {hasChildren && expanded && children.map((c, idx) => (
        <TreeItem key={c.id} id={c.id} depth={depth + 1}
          lastChain={[...lastChain, idx === children.length - 1]}
          NODES={NODES} getChildren={getChildren} currentId={currentId}
          isCollapsed={isCollapsed} onToggle={onToggle} onJump={onJump}
          onNodeContextMenu={onNodeContextMenu} isDimmed={isDimmed}
          selectedIds={selectedIds} onSelectedIdsChange={onSelectedIdsChange}
          dragInfo={dragInfo} onDragStartRow={onDragStartRow}
          onDragOverRow={onDragOverRow} onDragEndRow={onDragEndRow}
          onDropRow={onDropRow} />
      ))}
    </>
  );
}

// Flat tree row — used when the sidebar is in search-narrow mode. No indent
// guides, no expand/collapse: just icon + name + tag dots + status dot. The
// hierarchy returns as soon as the query is cleared.
function FlatTreeRow({ node, currentId, onJump, onNodeContextMenu, selectedIds, onSelectedIdsChange }) {
  const tip = useHoverTip(node?.name ?? '');
  const statusColor = node.status === 'err' ? 'var(--err)' : node.status === 'warn' ? 'var(--warn)' : node.status === 'ok' ? 'var(--ok)' : 'var(--fg-4)';
  const handleContextMenu = onNodeContextMenu
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onNodeContextMenu(node.id, { x: e.clientX, y: e.clientY });
      }
    : undefined;
  const isInMulti = !!(selectedIds && selectedIds.has(node.id));
  const handleRowClick = (e: React.MouseEvent) => {
    const modifier = e.metaKey || e.ctrlKey || e.shiftKey;
    if (modifier && onSelectedIdsChange) {
      e.preventDefault();
      const next = new Set(selectedIds ?? new Set<string>());
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
      onSelectedIdsChange(next);
      return;
    }
    onJump(node.id);
    onSelectedIdsChange?.(new Set([node.id]));
  };
  return (
    <div
      className={`tree-row tree-row--flat ${node.id === currentId ? 'tree-row--cur' : ''} ${isInMulti ? 'tree-row--multi' : ''}`}
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
      {...tip.handlers}
    >
      <span className="tree-iconbtn tree-iconbtn--leaf">
        <NodeIcon kind={node.kind || 'svc'} size={13} />
      </span>
      <button className="tree-label" onClick={(e) => { e.stopPropagation(); handleRowClick(e); }}>
        <span className="tree-name">{node.name}</span>
        {(node.tags ?? []).slice(0, 2).map((tag: string) => {
          const c = tagColor(tag);
          return (
            <span key={tag} className="tag-dot"
              style={{ borderColor: c.fg, background: c.bg }} title={tag} />
          );
        })}
        <span className="tree-dot" style={{ background: statusColor }} />
      </button>
      {tip.portal}
    </div>
  );
}

function Drawer({ open, onClose, onJumpNode, currentId, settingsActive, onOpenSettings, onCollapse, onNodeContextMenu, isDimmed, searchQuery, queryMatchesNode, selectedIds, onSelectedIdsChange }) {
  const { t } = useTranslation();
  const { NODES, getChildren, bulkUpdate } = useSorack();
  const isDesktop = useIsDesktop();

  // Drag-to-reorder state. Drop zone classifies what kind of drop:
  //   - 'before' / 'after': sibling reorder (same parent, reflow orderIdx)
  //   - 'into': reparent (target becomes the moved node's new parent;
  //     moved appends to target's children)
  // 'over' + 'pos' drives the drop indicator on the target row.
  type TreeDropPos = 'before' | 'after' | 'into';
  const [dragInfo, setDragInfo] = useStateA<{ draggedId: string; over: string | null; pos: TreeDropPos } | null>(null);
  const onTreeDragStart = (id: string) => setDragInfo({ draggedId: id, over: null, pos: 'after' });
  const onTreeDragOver = (id: string, pos: TreeDropPos) => {
    setDragInfo((cur) => (cur ? { ...cur, over: id, pos } : cur));
  };
  const onTreeDragEnd = () => setDragInfo(null);
  const onTreeDrop = async (dropOnId: string, pos: TreeDropPos) => {
    const drag = dragInfo;
    setDragInfo(null);
    if (!drag || drag.draggedId === dropOnId) return;
    const moved = NODES[drag.draggedId];
    const target = NODES[dropOnId];
    if (!moved || !target) return;

    if (pos === 'into') {
      // Reparent: moved becomes child of target. Cycle check + no-op skip.
      let cur: string | null = dropOnId;
      while (cur) {
        if (cur === drag.draggedId) return; // target is descendant of moved
        cur = NODES[cur]?.parentId ?? null;
      }
      if ((moved.parentId ?? null) === dropOnId) return; // already child
      const targetSibs = (Object.values(NODES) as any[])
        .filter((n) => (n.parentId ?? null) === dropOnId && n.id !== drag.draggedId);
      const { reflowItems, newOrderIdx } = appendToSiblings(targetSibs);
      const items = [
        ...reflowItems,
        { id: drag.draggedId, patch: { parentId: dropOnId, meta: { orderIdx: newOrderIdx ?? 1000 } } },
      ];
      try { await bulkUpdate(items); }
      catch (e) { console.error('sidebar reparent failed:', e); }
      return;
    }

    // pos === 'before' | 'after' — sibling reorder. Cross-parent drop in
    // these zones is silently ignored (use 'into' for reparent).
    if ((moved.parentId ?? null) !== (target.parentId ?? null)) return;
    const allSibs = (Object.values(NODES) as any[])
      .filter((n) => (n.parentId ?? null) === (moved.parentId ?? null))
      .sort(siblingSort);
    const without = allSibs.filter((n) => n.id !== drag.draggedId);
    const tIdx = without.findIndex((n) => n.id === dropOnId);
    if (tIdx === -1) return;
    const insertIdx = pos === 'before' ? tIdx : tIdx + 1;
    const reordered = [...without.slice(0, insertIdx), moved, ...without.slice(insertIdx)];
    const items = reordered.map((n, i) => ({ id: n.id, patch: { meta: { orderIdx: (i + 1) * 1000 } } }));
    try { await bulkUpdate(items); }
    catch (e) { console.error('reorder failed:', e); }
  };

  // Health roll-up across all nodes.
  const counts = { ok: 0, warn: 0, err: 0, unknown: 0 };
  for (const n of Object.values(NODES) as any[]) {
    if (n.status === 'err') counts.err++;
    else if (n.status === 'warn') counts.warn++;
    else if (n.status === 'ok') counts.ok++;
    else counts.unknown++;
  }

  const roots = (Object.values(NODES) as any[])
    .filter((n) => !n.parentId)
    .sort(siblingSort);

  // Track collapsed nodes (default = everything expanded, so new nodes
  // appear without a toggle). Module-free local state — resets on remount.
  const [collapsed, setCollapsed] = useStateA(() => new Set<string>());
  const isCollapsed = (id: string) => collapsed.has(id);
  const onToggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // When a node is selected, reveal it in the tree: expand every collapsed
  // ancestor on its path, then scroll the highlighted row into view.
  const treeRef = useRefA<HTMLDivElement>(null);
  useEffectA(() => {
    if (!currentId) return;
    const ancestors: string[] = [];
    let cur = NODES[currentId];
    while (cur && cur.parentId) { ancestors.push(cur.parentId); cur = NODES[cur.parentId]; }
    if (ancestors.length) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const a of ancestors) if (next.has(a)) { next.delete(a); changed = true; }
        return changed ? next : prev;
      });
    }
    // Scroll after the expand re-render paints the row.
    requestAnimationFrame(() => {
      treeRef.current?.querySelector('.tree-row--cur')?.scrollIntoView({ block: 'nearest' });
    });
  }, [currentId, NODES]);

  const jump = (id: string) => { onJumpNode(id); if (!isDesktop) onClose(); };

  return (
    <>
      <div className={`drawer-backdrop ${open && !isDesktop ? 'drawer-backdrop--open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open || isDesktop ? 'drawer--open' : ''}`}>
        <header className="drawer-head">
          <div className="drawer-head-title"><strong>{t('drawer.title')}</strong><span>{t('drawer.subtitle')}</span></div>
          <button className="topbar-icon-btn" onClick={onClose} aria-label={t('action.close')}>{Ic.close}</button>
        </header>

        {/* Health summary — counts by status. Collapse button (desktop) sits
            at the right edge of this bar. */}
        <div className="drawer-statusbar">
          <span className="drawer-stat-chip drawer-stat-chip--ok"><span className="drawer-stat-chip-dot" />{counts.ok}</span>
          <span className="drawer-stat-chip drawer-stat-chip--warn"><span className="drawer-stat-chip-dot" />{counts.warn}</span>
          <span className="drawer-stat-chip drawer-stat-chip--err"><span className="drawer-stat-chip-dot" />{counts.err}</span>
          {counts.unknown > 0 && <span className="drawer-stat-chip drawer-stat-chip--unknown"><span className="drawer-stat-chip-dot" />{counts.unknown}</span>}
          {isDesktop && (
            <button className="drawer-collapse-btn" onClick={onCollapse} aria-label={t('action.collapseSidebar', { defaultValue: 'Collapse sidebar' })} title={t('action.collapseSidebar', { defaultValue: 'Collapse sidebar' })}>{Ic.chevL}</button>
          )}
        </div>

        {/* Node tree navigator. Two modes:
              - searchQuery empty → hierarchical tree (TreeItem recursion).
                isDimmed (from the filter facets) fades non-matching rows.
              - searchQuery non-empty → flat list of just the matching nodes.
                The tree structure is hidden so query-narrowed results read
                as a simple result list, no indent guides. */}
        <div className="drawer-body drawer-tree" ref={treeRef}>
          {(() => {
            const q = (searchQuery ?? '').trim();
            if (q) {
              // Flat list = nodes matching the query AND the active filter
              // (intersection). isDimmed is the filter predicate from App —
              // when it returns true the node fails the filter and should
              // not show in the result list. AND logic with query.
              const matches = (Object.values(NODES) as any[])
                .filter((n) => queryMatchesNode?.(n.id))
                .filter((n) => !isDimmed || !isDimmed(n.id))
                .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
              if (matches.length === 0) {
                return <div className="drawer-tree-empty">{t('search.empty', { q, defaultValue: 'no matches' })}</div>;
              }
              return matches.map((n) => (
                <FlatTreeRow key={n.id} node={n} currentId={currentId}
                  onJump={jump} onNodeContextMenu={onNodeContextMenu}
                  selectedIds={selectedIds} onSelectedIdsChange={onSelectedIdsChange} />
              ));
            }
            if (roots.length === 0) {
              return <div className="drawer-tree-empty">{t('drawer.treeEmpty', { defaultValue: 'no nodes yet' })}</div>;
            }
            return roots.map((r) => (
              <TreeItem key={r.id} id={r.id} depth={0}
                NODES={NODES} getChildren={getChildren} currentId={currentId}
                isCollapsed={isCollapsed} onToggle={onToggle} onJump={jump}
                onNodeContextMenu={onNodeContextMenu} isDimmed={isDimmed}
                selectedIds={selectedIds} onSelectedIdsChange={onSelectedIdsChange}
                dragInfo={dragInfo} onDragStartRow={onTreeDragStart}
                onDragOverRow={onTreeDragOver} onDragEndRow={onTreeDragEnd}
                onDropRow={onTreeDrop} />
            ));
          })()}
        </div>

        <button
          className={`drawer-settings ${settingsActive ? 'drawer-settings--on' : ''}`}
          onClick={onOpenSettings}
        >
          <span className="drawer-settings-icon">{Ic.gear}</span>
          <span>{t('settings.title')}</span>
        </button>
      </aside>
    </>
  );
}

// ─── BottomSheet (mobile) / SidePanel (desktop) ───────────────────
const TAP_THRESHOLD = 8;   // px — below this, treat as tap (toggle), not drag
const SNAP_THRESHOLD = 50; // px — over this, snap to next state

function BottomSheet({ nodeId, onClose, onJumpNode, onOpenRunbook, onOpenActions, onIdChange, onOpenInfraGallery, onOpenSoftwareGallery }) {
  const { t } = useTranslation();
  const { NODES } = useSorack();
  const isDesktop = useIsDesktop();
  const [snap, setSnap] = useStateA('peek'); // peek | expand | full
  const dragState = useRefA(null);
  const sheetRef = useRefA(null);
  const bodyRef = useRefA(null);

  useEffectA(() => { setSnap('peek'); }, [nodeId]);
  useEffectA(() => {
    if (!nodeId) return;
    // Esc closes the sheet — but when editing a field, Esc should cancel the
    // edit (the input handles it), not close the panel. Skip if typing.
    const h = (e) => { if (isTypingEl(e.target)) return; if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nodeId, onClose]);

  const node = nodeId ? NODES[nodeId] : null;
  if (!node) return null;

  const cycleSnap = () => {
    setSnap((s) => s === 'peek' ? 'expand' : s === 'expand' ? 'full' : 'peek');
  };

  // Mobile drag: works on the whole sheet shell, not just the small handle.
  //   - Skipped on desktop, on the close button, and inside the body when
  //     the body has been scrolled (so content scroll still works).
  //   - We read the current effective translateY off the matrix so the
  //     finger stays aligned with the sheet.
  const onPointerDown = (e) => {
    if (isDesktop) return;
    const target = e.target;
    if (target.closest && target.closest('button.sheet-close')) return;
    // Body is scroll-only: a drag started inside it never moves the sheet
    // (so a long detail list scrolls naturally). The sheet is dragged by
    // the handle, header, or peek row — all of which sit outside .sheet-body.
    const body = bodyRef.current;
    if (body && body.contains(target)) return;

    const sheet = sheetRef.current; if (!sheet) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const m = new DOMMatrix(getComputedStyle(sheet).transform);
    dragState.current = {
      startY: e.clientY,
      startTranslateY: m.f || 0,
      startSnap: snap,
      dragging: true,
      moved: false,
      tapTarget: target,
    };
    sheet.classList.add('sheet--dragging');
  };
  const onPointerMove = (e) => {
    const st = dragState.current; if (!st?.dragging) return;
    const sheet = sheetRef.current; if (!sheet) return;
    const dy = e.clientY - st.startY;
    if (Math.abs(dy) > TAP_THRESHOLD) st.moved = true;
    // Once it's a real drag, stop the browser from also treating the
    // gesture as a body scroll (the .sheet--dragging class drops the
    // body's touch-action to none too).
    if (st.moved && e.cancelable) e.preventDefault();
    sheet.style.transform = `translateY(${st.startTranslateY + dy}px)`;
  };
  const onPointerUp = (e) => {
    const st = dragState.current; if (!st?.dragging) return;
    const sheet = sheetRef.current;
    sheet.style.transform = '';
    sheet.classList.remove('sheet--dragging');
    const dy = e.clientY - st.startY;

    // Treat small movement on a tappable region as a snap-cycle tap.
    if (!st.moved) {
      const tapped = st.tapTarget;
      const onPeek = tapped?.closest && tapped.closest('.sheet-peek-row');
      const onHandle = tapped?.closest && tapped.closest('.sheet-handle-area');
      if (onPeek || onHandle) cycleSnap();
      dragState.current = null;
      return;
    }

    // Snap to whichever target the sheet is closest to — lets a single
    // long drag jump straight from peek to full (or anywhere between),
    // instead of forcing two drags to reach the top.
    const currentTranslateY = st.startTranslateY + dy;
    const vh = window.innerHeight;
    const safeB = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0;
    const sheetPeek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-peek')) || 96;
    const targets: [string, number][] = [
      ['peek', vh - sheetPeek - safeB],
      ['expand', 0.4 * vh],
      ['full', 0],
    ];
    let next = st.startSnap;
    if (Math.abs(dy) >= SNAP_THRESHOLD) {
      next = targets.reduce((best, cur) =>
        Math.abs(cur[1] - currentTranslateY) < Math.abs(best[1] - currentTranslateY) ? cur : best,
      )[0];
    }
    setSnap(next);
    dragState.current = null;
  };

  return (
    <>
      <div className={`sheet-backdrop ${!isDesktop && snap !== 'peek' ? 'sheet-backdrop--show' : ''}`} onClick={() => setSnap('peek')} />
      <aside
        ref={sheetRef}
        className={`sheet sheet--${snap}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-handle-area">
          <div className="sheet-handle" />
        </div>
        <header className="sheet-head">
          <HeaderIcon node={node} />
          <div className="sheet-head-text">
            <EditableHeaderType node={node} onOpenGallery={() => onOpenInfraGallery?.()} />
            <EditableHeaderName node={node} onIdChange={onIdChange} />
          </div>
          <div className="sheet-head-actions">
            <button className="sheet-kebab" onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              // Anchor the menu just below the kebab, right-aligned to it.
              onOpenActions?.(nodeId, { x: r.right - 180, y: r.bottom + 4 });
            }} aria-label={t('action.more')}>{Ic.kebab}</button>
            <button className="sheet-close" onClick={onClose} aria-label={t('action.close')}>{Ic.close}</button>
          </div>
        </header>
        {/* Mobile peek row removed: status used to render here in a redundant
            band above the NodeDetail's own StatusLine. Status now lives only
            in StatusLine (same as desktop). The collector is the source of
            truth — unprobed nodes stay 'unknown', no manual status edit. */}
        <div className="sheet-body" ref={bodyRef}>
          <NodeDetail nodeId={nodeId} onJumpNode={onJumpNode} onOpenRunbook={onOpenRunbook} onIdChange={onIdChange} onOpenInfraGallery={onOpenInfraGallery} onOpenSoftwareGallery={onOpenSoftwareGallery} />
        </div>
      </aside>
    </>
  );
}

// ─── Full-screen Search (mobile path) ──────────────────────────────
// Mobile path of the unified search+filter surface. Desktop uses the inline
// FilterBar instead. The filter props let the same active-tags state drive
// both surfaces; the modal renders a chip strip above its results so users
// can refine without leaving the search overlay.
function SearchOverlay({
  open, onClose, onPickNode, onPickRunbook,
  activeTags = [], availableTags = [], onAddTag, onRemoveTag,
  onClearAll, hasActiveFilters,
}: {
  open: boolean;
  onClose: () => void;
  onPickNode: (id: string) => void;
  onPickRunbook: (id: string) => void;
  activeTags?: string[];
  availableTags?: string[];
  onAddTag?: (tag: string) => void;
  onRemoveTag?: (tag: string) => void;
  onClearAll?: () => void;
  hasActiveFilters?: boolean;
}) {
  const { t } = useTranslation();
  const { NODES, searchAll } = useSorack();
  const isDesktop = useIsDesktop();
  const [q, setQ] = useStateA('');
  const [cursor, setCursor] = useStateA(0);
  const inputRef = useRefA(null);
  const rawResults = useMemoA(() => searchAll(q), [q]);
  // Compose query results with the active tag filter (AND). Runbooks pass
  // through untouched — they don't carry tags (yet), so applying the filter
  // would drop them entirely. Only node-type rows are gated.
  const results = useMemoA(() => {
    if (activeTags.length === 0) return rawResults;
    return (rawResults as any[]).filter((r: any) => {
      if (r.type !== 'node') return true;
      const tags = (r.tags ?? []) as string[];
      return activeTags.every((t) => tags.includes(t));
    });
  }, [rawResults, activeTags]);

  useEffectA(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffectA(() => { setCursor(0); }, [q]);

  useEffectA(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onClose ? (open ? onClose() : null) : null; }
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  const pick = (r) => { r.type === 'node' ? onPickNode(r.id) : onPickRunbook(r.id); onClose(); setQ(''); };

  return (
    <div className={`fs-overlay fs-overlay--search`} onClick={(e) => { if (isDesktop && e.target === e.currentTarget) onClose(); }}>
      {!isDesktop && (
        <header className="fs-head">
          <button className="fs-back" onClick={onClose} aria-label={t('action.close')}>{Ic.close}</button>
          <div className="fs-title">{t('search.title')}</div>
          <span style={{ width: 44 }} />
        </header>
      )}
      <div className="search-input-wrap">
        <span className="search-icon">{Ic.search}</span>
        <input
          ref={inputRef}
          className="search-input"
          placeholder={t('search.placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(results.length - 1, c + 1)); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
            if (e.key === 'Enter' && results[cursor]) pick(results[cursor]);
          }}
        />
      </div>
      {/* Filter chips inline above the result list — same shape as the
          desktop FilterBar so the active-tags state is editable from either
          surface. Rendered only when there are tags in the system or
          active filters to show. */}
      {(availableTags.length > 0 || activeTags.length > 0) && onAddTag && onRemoveTag && (
        <div className="filter-bar-chips fs-filter">
          <span className="filter-bar-lbl">{t('filter.tagsLabel', { defaultValue: 'filter' })}</span>
          {activeTags.map((tag) => (
            <TagChip key={tag} value={tag} onRemove={() => onRemoveTag(tag)} active />
          ))}
          {availableTags.filter((tg) => !activeTags.includes(tg)).length > 0 && (
            <Dropdown
              value=""
              placeholder={t('filter.addTag', { defaultValue: '+ filter' })}
              options={availableTags
                .filter((tg) => !activeTags.includes(tg))
                .map((tg) => ({ value: tg, label: tg }))}
              onChange={(v) => v && onAddTag(v)}
              className="filter-picker"
              ariaLabel={t('filter.addTag', { defaultValue: '+ filter' })}
            />
          )}
          {hasActiveFilters && onClearAll && (
            <button type="button" className="filter-row-clear" onClick={onClearAll}>
              {t('filter.clear', { defaultValue: 'clear' })}
            </button>
          )}
        </div>
      )}
      <div className="fs-body search-results">
        {!q && <div className="search-hint">{isDesktop ? <><span><kbd>↑↓</kbd> {t('search.hintNav')}</span><span><kbd>↵</kbd> {t('search.hintOpen')}</span></> : t('search.typeToSearch')}</div>}
        {q && results.length === 0 && <div className="search-empty">{t('search.empty', { q })}</div>}
        {results.map((r, i) => (
          <button
            key={`${r.type}-${r.id}`}
            className={`search-row ${i === cursor ? 'search-row--cur' : ''}`}
            onClick={() => pick(r)}
            onMouseEnter={() => setCursor(i)}
          >
            <span className="search-row-icon">
              {r.type === 'node' ? <NodeIcon kind={NODES[r.id]?.kind || 'svc'} size={14} /> : <span style={{ color: 'var(--accent)' }}>{Ic.book}</span>}
            </span>
            <span className={`search-row-type search-row-type--${r.type}`}>{t(`searchResultType.${r.type}`)}</span>
            <span className="search-row-label">{r.label}</span>
            <span className="search-row-sub">{r.sub}</span>
            {/* Node result tags — outlined ring dots, same shape as the
                sidebar tree. matchedTag (the one that satisfied the query,
                if any) goes first; the rest follow so the user sees the
                "why" up front. */}
            {r.type === 'node' && (r.tags?.length ?? 0) > 0 && (
              <span className="search-row-tags">
                {[r.matchedTag, ...(r.tags || []).filter((tg: string) => tg !== r.matchedTag)]
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((tg: string) => {
                    const c = tagColor(tg);
                    return (
                      <span
                        key={tg}
                        className="tag-dot"
                        style={{ borderColor: c.fg, background: c.bg }}
                        title={tg}
                      />
                    );
                  })}
              </span>
            )}
            {r.type === 'node' && r.status && <span className={`search-row-dot search-row-dot--${r.status}`} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Full-screen Alerts ────────────────────────────────────────────
function AlertsOverlay({ open, onClose, onPick }) {
  const { t } = useTranslation();
  const { ALERTS, NODES } = useSorack();
  if (!open) return null;
  return (
    <div className="fs-overlay fs-overlay--alerts">
      <header className="fs-head">
        <button className="fs-back" onClick={onClose} aria-label={t('action.back')}>{Ic.close}</button>
        <div className="fs-title">{t('alerts.title')} <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-3)', marginLeft: 6 }}>{ALERTS.length}</span></div>
        <span style={{ width: 44 }} />
      </header>
      <div className="fs-body alerts-list">
        {ALERTS.map(a => (
          <button key={a.id} className="alert-row" onClick={() => onPick(a)}>
            <span className={`alert-sev alert-sev--${a.severity}`}>{t(a.severity === 'err' ? 'alerts.sevErr' : 'alerts.sevWarn')}</span>
            <div>
              <div className="alert-title">{a.title}</div>
              <div className="alert-detail">{a.detail}</div>
            </div>
            <div className="alert-meta">
              <span className="alert-age">{a.age}</span>
              <span className="alert-target">→ {NODES[a.nodeId]?.name || a.nodeId}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Splitter (desktop column resizer) ────────────────────────────
const COL_L_MIN = 180;
const COL_L_MAX = 400;
const COL_R_MIN = 320;
const COL_R_MAX = 720;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function Splitter({ side, value, onChange }) {
  const startRef = useRefA(null);
  const onDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add('splitter--dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    startRef.current = { x: e.clientX, w: value };
  };
  const onMove = (e) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const raw = side === 'left' ? startRef.current.w + dx : startRef.current.w - dx;
    const [min, max] = side === 'left' ? [COL_L_MIN, COL_L_MAX] : [COL_R_MIN, COL_R_MAX];
    onChange(clamp(raw, min, max));
  };
  const onUp = (e) => {
    if (!startRef.current) return;
    e.currentTarget.classList.remove('splitter--dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    startRef.current = null;
  };
  return (
    <div
      className={`splitter splitter--${side}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    />
  );
}

// ─── Routed page wrappers ─────────────────────────────────────────
// Small helpers that exist so the page-level URL params (settings
// category, runbook id) can be read via useParams() from inside a
// Route element. Keeps App.tsx itself routing-aware without forcing
// the big shared state in App to be split into pieces.

function SettingsRoute({ theme, setTheme }: { theme: 'dark'|'light'; setTheme: (t: 'dark'|'light') => void }) {
  const { category } = useParams();
  const navigate = useNavigate();
  return (
    <SettingsView
      theme={theme}
      setTheme={setTheme}
      category={(category as any) || 'appearance'}
      onCategoryChange={(c) => navigate(`/settings/${c}`)}
      onClose={() => navigate('/')}
    />
  );
}

function RunbookFirstRedirect() {
  const { RUNBOOKS } = useSorack();
  const first = Object.keys(RUNBOOKS)[0];
  if (!first) return <Navigate to="/" replace />;
  return <Navigate to={`/runbooks/${encodeURIComponent(first)}`} replace />;
}

function RunbookRoute({ onJumpNode, onClose }: { onJumpNode: (id: string) => void; onClose: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <RunbookScreen
      runbookId={id || null}
      onClose={onClose}
      onJumpNode={onJumpNode}
      onJumpRunbook={(rid: string) => navigate(`/runbooks/${encodeURIComponent(rid)}`)}
    />
  );
}

// ─── Main App ──────────────────────────────────────────────────────
export function App() {
  const { t } = useTranslation();
  const { NODES, EDGES, RUNBOOKS, ALERTS, getPath, deleteNode, createNode, updateNode,
          createEdge, updateEdge, deleteEdge, searchAll, bulkUpdate, bulkDelete } = useSorack();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [theme, setTheme] = useStateA(() => localStorage.getItem('sorack-theme') || 'dark');
  const [drawerOpen, setDrawerOpen] = useStateA(false);
  // Desktop-only: collapse the left sidebar to give the map more room.
  // (Mobile already overlays the drawer, so collapsing isn't relevant there.)
  const [drawerCollapsed, setDrawerCollapsed] = useStateA(() => localStorage.getItem('sorack-drawer-collapsed') === '1');
  useEffectA(() => { localStorage.setItem('sorack-drawer-collapsed', drawerCollapsed ? '1' : '0'); }, [drawerCollapsed]);
  const [searchOpen, setSearchOpen] = useStateA(false);
  // Multi-select for bulk operations. Independent of `selectedId` (the URL-
  // bound "primary" that drives the detail panel) so multi-mode doesn't keep
  // navigating: single click sets selectedId, cmd/shift+click toggles
  // membership in selectedIds, cmd+drag = selection box. BulkBar appears
  // when selectedIds.size >= 2.
  const [selectedIds, setSelectedIds] = useStateA<Set<string>>(() => new Set());
  // Lifted from SearchOverlay so the desktop FilterBar can drive sidebar
  // narrowing live as the user types. On the mobile path the existing
  // SearchOverlay still owns its own input state (see SearchOverlay below)
  // — they share `searchOpen` toggle but not the query string. The query
  // resets to '' when the bar collapses so a stale query doesn't keep
  // narrowing the sidebar invisibly.
  const [searchQuery, setSearchQuery] = useStateA('');
  useEffectA(() => { if (!searchOpen) setSearchQuery(''); }, [searchOpen]);
  const [alertsOpen, setAlertsOpen] = useStateA(false);
  // Active filter, ephemeral (resets on reload). Generic facet shape so
  // future facets (types / software / runbook category) can join without a
  // schema change: { tags: ['env:prod'], types: ['host'], ... }. v1 = tags
  // only. AND logic across all values within a facet (a node passes when it
  // has every active tag); cross-facet conjunction follows the same rule
  // once more facets land.
  const [activeFilters, setActiveFilters] = useStateA<Record<string, string[]>>({});
  const addFilter = (facet: string, value: string) =>
    setActiveFilters((cur) => {
      const list = cur[facet] ?? [];
      if (list.includes(value)) return cur;
      return { ...cur, [facet]: [...list, value] };
    });
  const removeFilter = (facet: string, value: string) =>
    setActiveFilters((cur) => {
      const list = (cur[facet] ?? []).filter((x) => x !== value);
      const next = { ...cur };
      if (list.length === 0) delete next[facet];
      else next[facet] = list;
      return next;
    });
  const clearAllFilters = () => setActiveFilters({});
  const hasActiveFilters = Object.values(activeFilters).some((list) => list.length > 0);

  // ── Router-derived view state ─────────────────────────────────
  // Single source of truth = the URL. mainView, runbook id, and the
  // selected node are all read off location/searchParams so deep
  // links, refresh, and back-nav all do the right thing.
  const isSettings = location.pathname.startsWith('/settings');
  const isRunbook = location.pathname.startsWith('/runbooks');
  const onMap = !isSettings && !isRunbook;
  const selectedId = onMap ? (searchParams.get('node') || null) : null;

  const setSelectedId = (id: string | null) => {
    if (!onMap) {
      navigate(id ? `/?node=${encodeURIComponent(id)}` : '/');
      return;
    }
    const sp = new URLSearchParams(searchParams);
    if (id) sp.set('node', id); else sp.delete('node');
    setSearchParams(sp, { replace: true });
  };

  // Selecting a node auto-expands a collapsed sidebar so the node shows up
  // highlighted in the tree. Done at the call sites (openView / onJumpNode)
  // rather than an effect.
  const expandIfCollapsed = () => { if (isDesktop && drawerCollapsed) setDrawerCollapsed(false); };

  // Tag filter derived state. `availableTags` = every tag currently on at
  // least one node, sorted — feeds the filter picker. `isDimmed` = the
  // predicate consumers (map, tree) call to decide if a node should fade
  // out. AND logic: a node passes only when it has every tag in the filter.
  const availableTags = useMemoA(() => {
    const set = new Set<string>();
    for (const n of Object.values(NODES) as any[]) {
      for (const t of (n.tags ?? []) as string[]) set.add(t);
    }
    return Array.from(set).sort();
  }, [NODES]);
  const isDimmed = useCallbackA((id: string) => {
    if (!hasActiveFilters) return false;
    const node = NODES[id];
    if (!node) return false;
    // Tags facet — every active tag must be present on the node. Future
    // facets (types/software) check here too with the same AND logic.
    const wantTags = activeFilters.tags ?? [];
    if (wantTags.length > 0) {
      const have = (node.tags ?? []) as string[];
      if (!wantTags.every((t) => have.includes(t))) return true;
    }
    return false;
  }, [NODES, activeFilters, hasActiveFilters]);

  // Query → node match (sidebar narrowing in query mode). Substring on
  // name/id/tags. Empty query means "no narrowing by query".
  const queryMatchesNode = useCallbackA((id: string) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const n = NODES[id];
    if (!n) return false;
    if ((n.name ?? '').toLowerCase().includes(q)) return true;
    if (n.id.toLowerCase().includes(q)) return true;
    const tags = (n.tags ?? []) as string[];
    return tags.some((tg) => tg.toLowerCase().includes(q));
  }, [NODES, searchQuery]);

  // Runbook hits — small inline section in FilterBar. Empty query = no hits.
  const runbookResults = useMemoA(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return (searchAll(q) as any[])
      .filter((r) => r.type === 'runbook')
      .slice(0, 8)
      .map((r) => ({ id: r.id, label: r.label, sub: r.sub }));
  }, [searchQuery, searchAll]);

  // actionsCtx kinds: 'node' | 'pane' | 'edge' (existing edge ctx menu)
  //                 | 'edge_picker' (post-drag type chooser)
  const [actionsCtx, setActionsCtx] = useStateA(null);
  const [confirmDeleteId, setConfirmDeleteId] = useStateA(null);   // node id pending confirm
  const [confirmDeleteEdgeId, setConfirmDeleteEdgeId] = useStateA(null); // db edge id pending confirm
  // Software gallery (P1b-2) — kebab "configure software" opens this in
  // grid mode (detailId = null). B-3: StatusLine ⚙ on a software-primary
  // node opens it straight into that software's detail (detailId = swId)
  // so monitoring settings are one click away.
  const [softwareGalleryNodeId, setSoftwareGalleryNodeId] = useStateA<string | null>(null);
  const [softwareGalleryDetailId, setSoftwareGalleryDetailId] = useStateA<string | null>(null);
  const openSoftwareGallery = useCallbackA((nodeId: string, detailId?: string | null) => {
    setSoftwareGalleryNodeId(nodeId);
    setSoftwareGalleryDetailId(detailId ?? null);
  }, []);
  // Infra gallery (B-2 v2) — owner is here so the header type label, kebab
  // "Configure type…", and NodeDetail's monitoring entries ALL trigger the
  // SAME gallery. detailId=null = grid view (type picker), detailId=type
  // jumps straight to that card's detail view (monitoring settings live in
  // the MonitoringSlot renderDetailExtra of the current type's card).
  const [infraGalleryNodeId, setInfraGalleryNodeId] = useStateA<string | null>(null);
  const [infraGalleryDetailId, setInfraGalleryDetailId] = useStateA<string | null>(null);
  const openInfraGallery = useCallbackA((nodeId: string, detailId?: string | null) => {
    setInfraGalleryNodeId(nodeId);
    setInfraGalleryDetailId(detailId ?? null);
  }, []);

  const [colL, setColL] = useStateA(() => {
    const v = parseInt(localStorage.getItem('sorack-col-l') || '', 10);
    return Number.isFinite(v) ? clamp(v, COL_L_MIN, COL_L_MAX) : 240;
  });
  const [colR, setColR] = useStateA(() => {
    const v = parseInt(localStorage.getItem('sorack-col-r') || '', 10);
    return Number.isFinite(v) ? clamp(v, COL_R_MIN, COL_R_MAX) : 400;
  });
  useEffectA(() => { localStorage.setItem('sorack-col-l', String(colL)); }, [colL]);
  useEffectA(() => { localStorage.setItem('sorack-col-r', String(colR)); }, [colR]);

  useEffectA(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sorack-theme', theme);
  }, [theme]);

  // Undo/redo, defined at component scope so both the keyboard shortcut
  // (in useKeyboardShortcuts below) and the on-screen buttons (mobile has
  // no Cmd+Z) can call them.
  // Apply the inverse of one atomic op. Used for plain undo, and as the
  // per-sub-op step inside a batch undo.
  const undoAtomic = async (op: any) => {
    if (op.type === 'update') await updateNode(op.id, op.before);
    else if (op.type === 'create') await deleteNode(op.payload.id);
    else if (op.type === 'delete') await createNode({
      id: op.node.id, type: op.node.type, name: op.node.name,
      parentId: op.node.parentId, status: op.node.status, meta: op.node.meta,
    });
  };
  const redoAtomic = async (op: any) => {
    if (op.type === 'update') await updateNode(op.id, op.after);
    else if (op.type === 'create') await createNode(op.payload);
    else if (op.type === 'delete') await deleteNode(op.node.id);
  };

  const doUndo = useCallbackA(async () => {
    const op = history.popUndo();
    if (!op) return;
    await history.suppress(async () => {
      try {
        if (op.type === 'batch') {
          // Reverse order so sub-ops unwind in the opposite of how they
          // were applied (matters when later ops depend on earlier ones).
          for (const sub of [...op.ops].reverse()) await undoAtomic(sub);
        } else {
          await undoAtomic(op);
        }
      } catch (err) { console.error('undo failed:', err); return; }
    });
    history.pushRedo(op);
  }, [updateNode, createNode, deleteNode]);

  const doRedo = useCallbackA(async () => {
    const op = history.popRedo();
    if (!op) return;
    await history.suppress(async () => {
      try {
        if (op.type === 'batch') {
          for (const sub of op.ops) await redoAtomic(sub);
        } else {
          await redoAtomic(op);
        }
      } catch (err) { console.error('redo failed:', err); return; }
    });
    history.pushUndo(op);
  }, [updateNode, createNode, deleteNode]);

  // Live undo/redo availability for the buttons' disabled state.
  const [histAvail, setHistAvail] = useStateA(() => ({ undo: history.canUndo(), redo: history.canRedo() }));
  useEffectA(() => history.subscribe(() => setHistAvail({ undo: history.canUndo(), redo: history.canRedo() })), []);

  const breadcrumb = useMemoA(() => selectedId ? getPath(selectedId) : [], [selectedId]);

  const onJumpNode = (id) => {
    setSearchOpen(false);
    setAlertsOpen(false);
    expandIfCollapsed();
    navigate(id ? `/?node=${encodeURIComponent(id)}` : '/');
  };
  const onOpenRunbook = (id) => {
    setSearchOpen(false);
    setAlertsOpen(false);
    navigate(`/runbooks/${encodeURIComponent(id)}`);
  };
  const onCloseRunbook = () => navigate('/');

  const alertsCount = {
    err: ALERTS.filter(a => a.severity === 'err').length,
    warn: ALERTS.filter(a => a.severity === 'warn').length,
  };

  // ── Phase 3B handlers ──────────────────────────────────────────────
  // Navigating to a single node also collapses the multi-set to that one
  // node — without this, a leftover multi-set (e.g. after a duplicate or a
  // breadcrumb jump) keeps showing the old members as still-selected on the
  // graph and sidebar.
  const openView = (id) => {
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    expandIfCollapsed();
  };
  const closeSheet = () => setSelectedId(null);

  // Create immediately with an auto-incremented "New" name, then select
  // it so the operator can rename / re-type / re-icon inline. The
  // `meta.idAuto` flag tells renameNode that the next user-typed name
  // should also re-slug the id (so the row stops being "new" once it
  // has a real name).
  const openCreate = async (parentId = null) => {
    let i = 0;
    let name, id;
    while (true) {
      name = i === 0 ? 'New' : `New ${i}`;
      id   = i === 0 ? 'new'  : `new-${i}`;
      if (!NODES[id]) break;
      i++;
    }
    // Append below existing siblings. If any sibling lacks orderIdx, reflow
    // them first to multiples of 1000 in their current sorted order so the
    // new node (max + 1000) cleanly lands at the bottom of the visible list.
    const siblings = (Object.values(NODES) as any[])
      .filter((n) => (n.parentId ?? null) === (parentId ?? null));
    const { reflowItems, newOrderIdx } = appendToSiblings(siblings);
    try {
      if (reflowItems.length > 0) await bulkUpdate(reflowItems);
      await createNode({
        id, type: 'host', name,
        parentId: parentId || null,
        status: 'unknown',
        meta: { idAuto: true, ...(newOrderIdx !== undefined ? { orderIdx: newOrderIdx } : {}) },
      });
      openView(id);
    } catch (e) { console.error('create failed:', e); }
  };

  const openActions = (kind, opts) => setActionsCtx({ kind, ...opts });
  const closeActions = () => setActionsCtx(null);

  // Duplicate a single node — copies identity-ish fields (type, name, parent,
  // manual meta, tags) but strips per-instance state: probe configs would
  // re-target the same endpoint by accident, observed/* is collector-owned,
  // maintenance is a deliberate operational flag. Status resets to 'unknown'
  // so the collector picks it up fresh once a probe is added.
  const duplicateNode = async (sourceId: string) => {
    const src = NODES[sourceId];
    if (!src) return;
    const srcMeta = (src.meta ?? {}) as Record<string, unknown>;
    // Keep manual + software (axis-2 attachments) so the duplicate carries
    // the user's authored fields and identity. Drop everything else.
    const meta: Record<string, unknown> = {};
    if (srcMeta.manual) meta.manual = { ...(srcMeta.manual as Record<string, unknown>) };
    if (srcMeta.software) meta.software = Array.isArray(srcMeta.software)
      ? [...(srcMeta.software as string[])]
      : srcMeta.software;
    if (srcMeta.iconKind) meta.iconKind = srcMeta.iconKind;
    if (srcMeta.statusPrimary) meta.statusPrimary = srcMeta.statusPrimary;
    // Append the copy after existing siblings; auto-reflow if mixed state.
    const siblings = (Object.values(NODES) as any[])
      .filter((n: any) => (n.parentId ?? null) === (src.parentId ?? null));
    const dupResult = appendToSiblings(siblings);
    if (dupResult.reflowItems.length > 0) {
      try { await bulkUpdate(dupResult.reflowItems); }
      catch (e) { console.error('reflow before duplicate failed:', e); }
    }
    if (dupResult.newOrderIdx !== undefined) meta.orderIdx = dupResult.newOrderIdx;

    const newName = `${src.name} (copy)`;
    const taken = new Set(Object.keys(NODES));
    const slug = slugify(newName) || `${src.id}-copy`;
    const newId = uniqueSlug(slug, taken);

    try {
      await createNode({
        id: newId,
        type: src.type,
        name: newName,
        parentId: src.parentId ?? null,
        status: 'unknown',
        meta,
        tags: [...((src.tags ?? []) as string[])],
      });
      openView(newId);
    } catch (e) { console.error('duplicate failed:', e); }
  };

  const requestDelete = (nodeId) => { setConfirmDeleteId(nodeId); };
  const doDelete = async () => {
    const id = confirmDeleteId; if (!id) return;
    try { await deleteNode(id); } catch (e) { console.error(e); }
    setConfirmDeleteId(null);
    if (selectedId === id) closeSheet();
  };

  // Bulk actions for the multi-selected set. Each delegates to SorackData's
  // bulkUpdate / bulkDelete, which wraps the per-node loop in a single
  // history.pushBatch — so one ⌘Z undoes the whole bulk action atomically.
  const bulkClear = () => setSelectedIds(new Set());
  const bulkAddTag = async (tag: string) => {
    const items: Array<{ id: string; patch: any }> = [];
    for (const id of Array.from(selectedIds)) {
      const n = NODES[id];
      if (!n) continue;
      const have = (n.tags ?? []) as string[];
      if (have.includes(tag)) continue;
      items.push({ id, patch: { tags: [...have, tag] } });
    }
    if (items.length > 0) await bulkUpdate(items);
  };
  const bulkReparent = async (parentId: string | null) => {
    const items = Array.from(selectedIds).map((id) => ({ id, patch: { parentId } }));
    if (items.length > 0) await bulkUpdate(items);
  };
  const [confirmBulkDelete, setConfirmBulkDelete] = useStateA(false);
  const doBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    setConfirmBulkDelete(false);
    await bulkDelete(ids);
    setSelectedIds(new Set());
    if (selectedId && ids.includes(selectedId)) closeSheet();
  };

  // Reparent picker targets — every node minus the selected set and any
  // descendant of a selected node (would create a cycle). The "(make root)"
  // option is appended by BulkBar. Short-circuit when BulkBar isn't visible
  // (size < 2) so single-click flows don't trigger the BFS each time.
  const reparentTargets = useMemoA(() => {
    if (selectedIds.size < 2) return [];
    const forbidden = new Set<string>(selectedIds);
    // BFS descendants of each selected node — mark all reachable as forbidden.
    const queue = Array.from(selectedIds);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of Object.values(NODES) as any[]) {
        if (n.parentId === cur && !forbidden.has(n.id)) {
          forbidden.add(n.id);
          queue.push(n.id);
        }
      }
    }
    return (Object.values(NODES) as any[])
      .filter((n) => !forbidden.has(n.id))
      .map((n) => ({ id: n.id, name: n.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedIds, NODES]);

  // App-level keyboard shortcuts. Component-local handlers (NodeDetail's Esc,
  // search overlay's own Cmd+K close) stay where they are — they own the
  // state they cancel. Everything here is global to the app shell.
  useKeyboardShortcuts([
    // Search overlay toggle
    { key: 'k', cmd: true, handler: () => setSearchOpen((o) => !o) },
    // Undo / redo. Cmd+Z = undo, Shift+Cmd+Z or Cmd+Y = redo. Skipped while
    // typing so the browser's native field-level undo wins.
    { key: 'z', cmd: true, shift: false, handler: () => doUndo() },
    { key: 'z', cmd: true, shift: true,  handler: () => doRedo() },
    { key: 'y', cmd: true,               handler: () => doRedo() },
    // Delete selected node (with the same confirm dialog as the right-click
    // 'delete' item). Backspace intentionally skipped — too easy to hit by
    // accident on macOS where it's also the back-nav key.
    { key: 'Delete', when: () => !!selectedId,
      handler: () => setConfirmDeleteId(selectedId) },
    // New node — child of the current selection if any, otherwise root.
    { key: 'n', cmd: false,
      handler: () => openCreate(selectedId ?? null) },
    // Toggle the left drawer on desktop. Cheap escape hatch when the
    // sidebar gets in the way.
    { key: '[', cmd: false,
      handler: () => setDrawerCollapsed((c) => !c) },
    // Clear selection — closes the detail sheet without touching the rest
    // of the URL.
    { key: ']', cmd: false, when: () => !!selectedId,
      handler: () => setSelectedId(null) },
  ]);

  // Node ctx menu: 'edit' is intentionally gone — editing happens in
  // the detail panel itself. 'make root' only appears for non-root
  // nodes (no point showing it for a node that already has no parent).
  const buildActionItems = (): ActionMenuItem[] => {
    if (!actionsCtx) return [];
    if (actionsCtx.kind === 'node') {
      const items: ActionMenuItem[] = [
        { key: 'addchild', label: t('nodeActions.addChild'), icon: Ic.plus,
          onClick: () => { closeActions(); openCreate(actionsCtx.nodeId); } },
      ];
      if (NODES[actionsCtx.nodeId]?.parentId) {
        items.push({ key: 'makeroot', label: t('nodeActions.makeRoot'), icon: Ic.up,
          onClick: () => { const id = actionsCtx.nodeId; closeActions(); updateNode(id, { parentId: null }).catch((e: any) => console.error(e)); } });
      }
      // Configure infra type (axis 1) — opens the shared infra gallery in
      // grid mode for type browsing. Different surface from the header label
      // (which used to open the same gallery), but same destination — so a
      // user who's already in the kebab doesn't have to dismiss it.
      items.push({
        key: 'configure-infra',
        label: t('nodeActions.configureType', { defaultValue: 'Configure type…' }),
        divider: true,
        onClick: () => { const nid = actionsCtx.nodeId; closeActions(); openInfraGallery(nid, null); },
      });
      // Configure software (axis 2) — single entry opens the card gallery in
      // multi-toggle mode (P1b-2). Hidden when the infra type has no
      // compatible software at all (e.g. router), so the menu doesn't carry a
      // dead option.
      const swNode = NODES[actionsCtx.nodeId];
      if (softwareForInfra(swNode?.type).length > 0) {
        items.push({
          key: 'configure-sw',
          label: t('nodeActions.configureSoftware', { defaultValue: 'Configure software…' }),
          onClick: () => { const nid = actionsCtx.nodeId; closeActions(); openSoftwareGallery(nid, null); },
        });
      }
      items.push({
        key: 'duplicate',
        label: t('nodeActions.duplicate', { defaultValue: 'Duplicate' }),
        icon: Ic.copy,
        divider: true,
        onClick: () => { const id = actionsCtx.nodeId; closeActions(); duplicateNode(id); },
      });
      items.push({ key: 'delete', label: t('nodeActions.delete'), icon: Ic.trash, danger: true, divider: true,
        onClick: () => { const id = actionsCtx.nodeId; closeActions(); requestDelete(id); } });
      return items;
    }
    if (actionsCtx.kind === 'pane') {
      return [
        { key: 'add', label: t('nodeActions.addRoot'), icon: Ic.plus,
          onClick: () => { closeActions(); openCreate(); } },
      ];
    }
    // Post-drag picker: ask which kind of edge the user just drew.
    // 'contains' is special-cased into a reparent (no DB row) so the
    // tree drag-to-reparent and handle drag-to-connect stay consistent.
    if (actionsCtx.kind === 'edge_picker') {
      const { source, target } = actionsCtx;
      const items: ActionMenuItem[] = EDGE_TYPE_CHOICES.map(type => {
        // Don't let the same relationship be drawn twice. A (source,
        // target, type) that already exists is shown disabled so the
        // operator sees why nothing happened, rather than silently no-op.
        const exists = EDGES.some((e: any) => e.sourceId === source && e.targetId === target && e.type === type);
        return {
          key: `connect-${type}`,
          label: t(`edgeActions.create.${type}`, { defaultValue: type }),
          hint: exists ? '✓' : undefined,
          disabled: exists,
          onClick: () => {
            closeActions();
            if (exists) return;
            createEdge({ sourceId: source, targetId: target, type }).catch((e: any) => console.error('createEdge failed:', e));
          },
        };
      });
      items.push({
        key: 'connect-contains',
        label: t('edgeActions.create.contains', { defaultValue: 'contains (re-parent)' }),
        icon: Ic.up,
        divider: true,
        onClick: () => {
          closeActions();
          // 'contains' = parent→child; we model it as a reparent of the
          // target onto the source, not as a DB edge row.
          updateNode(target, { parentId: source }).catch((e: any) => console.error(e));
        },
      });
      return items;
    }
    // Existing edge ctx menu: change type or delete.
    if (actionsCtx.kind === 'edge') {
      const { dbId, type, targetId } = actionsCtx;
      // Tree edges (dbId=null) are derived from the child's parentId — they
      // have no row to retype/delete. Instead of an empty menu, offer to
      // detach the connection (make the child a root).
      if (!dbId) {
        return [{
          key: 'detach', icon: Ic.up,
          label: t('edgeActions.detach', { defaultValue: 'detach (make child a root)' }),
          onClick: () => { closeActions(); updateNode(targetId, { parentId: null }).catch((e: any) => console.error(e)); },
        }];
      }
      const items: ActionMenuItem[] = [];
      for (const t2 of EDGE_TYPE_CHOICES) {
        if (t2 === type) continue;
        items.push({
          key: `retype-${t2}`,
          label: t(`edgeActions.changeTo.${t2}`, { defaultValue: `change to ${t2}` }),
          onClick: () => { closeActions(); updateEdge(dbId, { type: t2 }).catch((e: any) => console.error(e)); },
        });
      }
      items.push({
        key: 'edge-delete', label: t('edgeActions.delete', { defaultValue: 'delete edge' }),
        icon: Ic.trash, danger: true, divider: true,
        onClick: () => { closeActions(); setConfirmDeleteEdgeId(dbId); },
      });
      return items;
    }
    return [];
  };
  const actionItems: ActionMenuItem[] = buildActionItems();

  const appStyle = isDesktop ? ({ '--col-l': `${colL}px`, '--col-r': `${colR}px` } as React.CSSProperties) : undefined;

  // Map pane element — defined here (not split into a separate file)
  // so it can close over the contextual handlers (openActions,
  // openView, closeSheet, splitter columns…). Lives inside <Routes>
  // below as the "/" route element.
  const mapPane = (
    <>
      <TopologyFlow
        selectedId={selectedId}
        onSelect={(id) => id ? openView(id) : closeSheet()}
        onNodeContextMenu={(e, nodeId) => {
          e.preventDefault();
          openActions('node', { nodeId, position: { x: e.clientX, y: e.clientY } });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          openActions('pane', { position: { x: e.clientX, y: e.clientY } });
        }}
        onConnect={(conn, position) => {
          openActions('edge_picker', { source: conn.source, target: conn.target, position });
        }}
        onEdgeContextMenu={(e, edge) => {
          openActions('edge', {
            edgeId: edge.id,
            dbId: edge.id.startsWith('db-') ? edge.id.slice(3) : null,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            type: edge.type,
            position: { x: e.clientX, y: e.clientY },
          });
        }}
        isDimmed={hasActiveFilters ? isDimmed : undefined}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={histAvail.undo}
        canRedo={histAvail.redo}
        undoIcon={Ic.undo}
        redoIcon={Ic.redo}
      />
      {selectedIds.size >= 2 && (
        <BulkBar
          count={selectedIds.size}
          availableTags={availableTags}
          reparentTargets={reparentTargets}
          onClear={bulkClear}
          onAddTag={bulkAddTag}
          onReparent={bulkReparent}
          onDelete={() => setConfirmBulkDelete(true)}
        />
      )}
      {selectedId && isDesktop && <Splitter side="right" value={colR} onChange={setColR} />}
      {selectedId && (
        <BottomSheet
          nodeId={selectedId}
          onClose={closeSheet}
          onJumpNode={onJumpNode}
          onOpenRunbook={onOpenRunbook}
          onOpenActions={(id, position) => openActions('node', { nodeId: id, position })}
          onIdChange={(newId) => setSelectedId(newId)}
          onOpenInfraGallery={(detailId) => openInfraGallery(selectedId, detailId)}
          onOpenSoftwareGallery={(detailId) => openSoftwareGallery(selectedId, detailId)}
        />
      )}
    </>
  );

  return (
    <div className="app" style={appStyle}>
      <TopBar
        onMenu={() => setDrawerOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onAlerts={() => setAlertsOpen(true)}
        onRunbooks={() => {
          const firstId = Object.keys(RUNBOOKS)[0];
          if (firstId) navigate(`/runbooks/${encodeURIComponent(firstId)}`);
        }}
        alertsCount={alertsCount}
        breadcrumb={breadcrumb}
        onCrumb={(id) => setSelectedId(id)}
        mode={isRunbook ? 'runbook' : 'map'}
      />

      {onMap && isDesktop && (
        <FilterBar
          open={searchOpen}
          onOpenChange={setSearchOpen}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          activeTags={activeFilters.tags ?? []}
          availableTags={availableTags}
          onAddTag={(tag) => addFilter('tags', tag)}
          onRemoveTag={(tag) => removeFilter('tags', tag)}
          onClearAll={clearAllFilters}
          hasActiveFilters={hasActiveFilters}
          runbookResults={runbookResults}
          onPickRunbook={(id) => navigate(`/runbooks/${encodeURIComponent(id)}`)}
        />
      )}

      <div className={`shell ${selectedId ? 'shell--has-detail' : ''} ${isDesktop && drawerCollapsed ? 'shell--drawer-collapsed' : ''}`}>
        {/* When collapsed on desktop, the drawer AND its splitter are not
            rendered at all (not display:none — that would still leave a
            phantom grid slot and shove the map into a 0-width track). The
            grid-template then matches exactly the items present. */}
        {(!isDesktop || !drawerCollapsed) && (
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onJumpNode={onJumpNode}
            currentId={selectedId}
            settingsActive={isSettings}
            onOpenSettings={() => { navigate('/settings/appearance'); if (!isDesktop) setDrawerOpen(false); }}
            onCollapse={() => setDrawerCollapsed(true)}
            onNodeContextMenu={(nodeId, position) => openActions('node', { nodeId, position })}
            isDimmed={hasActiveFilters ? isDimmed : undefined}
            searchQuery={searchQuery}
            queryMatchesNode={queryMatchesNode}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
          />
        )}
        {isDesktop && !drawerCollapsed && <Splitter side="left" value={colL} onChange={setColL} />}
        {isDesktop && drawerCollapsed && (
          <button
            className="sidebar-expand"
            onClick={() => setDrawerCollapsed(false)}
            aria-label={t('action.expandSidebar', { defaultValue: 'Expand sidebar' })}
            title={t('action.expandSidebar', { defaultValue: 'Expand sidebar' })}
          >{Ic.chevR}</button>
        )}
        <Routes>
          <Route path="/" element={mapPane} />
          <Route path="/settings" element={<Navigate to="/settings/appearance" replace />} />
          <Route path="/settings/:category" element={<SettingsRoute theme={theme} setTheme={setTheme} />} />
          <Route path="/runbooks" element={<RunbookFirstRedirect />} />
          <Route path="/runbooks/:id" element={<RunbookRoute onJumpNode={onJumpNode} onClose={onCloseRunbook} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Mobile keeps the modal SearchOverlay; desktop uses the inline
          FilterBar above so the sidebar can narrow live. The filter props
          mirror those passed to FilterBar so the mobile modal has the same
          chip strip + picker UX. */}
      {!isDesktop && (
        <SearchOverlay
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onPickNode={onJumpNode}
          onPickRunbook={onOpenRunbook}
          activeTags={activeFilters.tags ?? []}
          availableTags={availableTags}
          onAddTag={(tag) => addFilter('tags', tag)}
          onRemoveTag={(tag) => removeFilter('tags', tag)}
          onClearAll={clearAllFilters}
          hasActiveFilters={hasActiveFilters}
        />
      )}

      <AlertsOverlay
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        onPick={(a) => {
          setAlertsOpen(false);
          if (a.nodeId) onJumpNode(a.nodeId);
        }}
      />

      <ActionMenu
        open={actionsCtx !== null}
        position={actionsCtx?.position}
        onClose={closeActions}
        items={actionItems}
        title={actionsCtx?.kind === 'node' ? NODES[actionsCtx.nodeId]?.name : undefined}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={t('nodeActions.deleteTitle')}
        message={t('nodeActions.deleteMessage', { name: NODES[confirmDeleteId]?.name || confirmDeleteId })}
        confirmLabel={t('nodeActions.delete')}
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={doDelete}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title={t('bulk.deleteTitle', { defaultValue: 'Delete selected nodes?' })}
        message={t('bulk.deleteMessage', { count: selectedIds.size, defaultValue: `Delete ${selectedIds.size} selected nodes? This cannot be undone here (use undo).` })}
        confirmLabel={t('bulk.delete', { defaultValue: 'delete' })}
        danger
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={doBulkDelete}
      />

      <CardGallery
        open={softwareGalleryNodeId !== null}
        mode="software"
        title={t('nd.galleryPickSoftware', { defaultValue: 'Pick software' })}
        items={softwareGalleryNodeId
          ? softwareForInfra(NODES[softwareGalleryNodeId]?.type).map(({ id, tpl }) => ({
              id, name: tpl.name, category: tpl.category, description: tpl.description, entries: tpl.entries,
            } satisfies CardItem))
          : []}
        selectedIds={softwareGalleryNodeId ? softwareIds(NODES[softwareGalleryNodeId]) : []}
        onSelect={(swId) => {
          const nid = softwareGalleryNodeId; if (!nid) return;
          const cur = softwareIds(NODES[nid]);
          const next = cur.includes(swId) ? cur.filter((x) => x !== swId) : [...cur, swId];
          updateNode(nid, { meta: { software: next.length ? next : null } }).catch((e: any) => console.error(e));
        }}
        onClose={() => { setSoftwareGalleryNodeId(null); setSoftwareGalleryDetailId(null); }}
        openDetailId={softwareGalleryDetailId ?? undefined}
        renderDetailExtra={(swId) => {
          // B-3: each software card's detail shows its own MonitoringSlot —
          // probe target lives in meta.softwareProbes[swId], observed under
          // meta.observed.software[swId]. Only render when the software is
          // actually attached to the node (drilling into a card you haven't
          // added shouldn't offer to monitor it yet).
          const n = softwareGalleryNodeId ? NODES[softwareGalleryNodeId] : null;
          if (!n) return null;
          if (!softwareIds(n).includes(swId)) return null;
          return <MonitoringSlot node={n} updateNode={updateNode} aspect={swId} />;
        }}
      />

      {/* B-2 (v2): single infra gallery shared by header type label, kebab
          "Configure type…", and NodeDetail monitoring entries. detailId !==
          null skips straight to that card's detail (monitoring settings). */}
      <CardGallery
        open={infraGalleryNodeId !== null}
        mode="infra"
        title={t('nd.galleryPickType', { defaultValue: 'Pick a type' })}
        items={(() => {
          const n = infraGalleryNodeId ? NODES[infraGalleryNodeId] : null;
          return n ? buildInfraGalleryItems(n.kind || n.type) : [];
        })()}
        selectedIds={(() => {
          const n = infraGalleryNodeId ? NODES[infraGalleryNodeId] : null;
          return n && (n.kind || n.type) ? [n.kind || n.type] : [];
        })()}
        onSelect={(next) => {
          const nid = infraGalleryNodeId; if (!nid) return;
          commitInfraType(NODES[nid], next, updateNode);
        }}
        onClose={() => { setInfraGalleryNodeId(null); setInfraGalleryDetailId(null); }}
        openDetailId={infraGalleryDetailId ?? undefined}
        renderDetailExtra={(itemId) => {
          const n = infraGalleryNodeId ? NODES[infraGalleryNodeId] : null;
          if (!n) return null;
          return itemId === (n.kind || n.type)
            ? <MonitoringSlot node={n} updateNode={updateNode} />
            : null;
        }}
      />

      <ConfirmDialog
        open={confirmDeleteEdgeId !== null}
        title={t('edgeActions.deleteTitle', { defaultValue: 'Delete edge?' })}
        message={t('edgeActions.deleteMessage', { defaultValue: 'This edge will be removed from the topology.' })}
        confirmLabel={t('edgeActions.delete', { defaultValue: 'delete edge' })}
        danger
        onCancel={() => setConfirmDeleteEdgeId(null)}
        onConfirm={async () => {
          const id = confirmDeleteEdgeId; if (!id) return;
          try { await deleteEdge(id); } catch (e) { console.error(e); }
          setConfirmDeleteEdgeId(null);
        }}
      />
    </div>
  );
}

