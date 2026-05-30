// @ts-nocheck — Phase 4 marker (lab mockup migration).

// lab-app.jsx — main responsive app shell.

import * as React from "react";
import { useState as useStateA, useEffect as useEffectA, useRef as useRefA, useMemo as useMemoA, useCallback as useCallbackA } from "react";
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

// True when focus is in a text input / select / contenteditable. Global key
// handlers (Esc-to-close, Delete-to-remove) check this so editing a field
// doesn't trigger them.
const isTypingEl = (el) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

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
        <button className="topbar-search-trigger" onClick={onSearch}>
          {Ic.search}<span>{t('topbar.searchTrigger')}</span><kbd>⌘K</kbd>
        </button>
        <button className="topbar-icon-btn topbar-icon-btn--mobile-only" onClick={onSearch} aria-label={t('search.title')}>{Ic.search}</button>
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

// ─── Drawer (left) ─────────────────────────────────────────────────

// One row of the node tree. The node icon doubles as the expand/collapse
// toggle for parent nodes: it shows the type icon normally and swaps to a
// chevron (▸/▾) on hover, so there's no separate caret column. Clicking the
// name selects the node on the map. `lastChain[i]` = whether the ancestor at
// level i+1 (and finally this node) is its parent's last child — drives the
// vertical indent guides.
function TreeItem({ id, depth, lastChain = [], NODES, getChildren, currentId, isCollapsed, onToggle, onJump }) {
  const node = NODES[id];
  if (!node) return null;
  const children = getChildren(id).slice().sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  const hasChildren = children.length > 0;
  const expanded = !isCollapsed(id);
  const statusColor = node.status === 'err' ? 'var(--err)' : node.status === 'warn' ? 'var(--warn)' : node.status === 'ok' ? 'var(--ok)' : 'var(--fg-4)';
  return (
    <>
      <div className={`tree-row ${id === currentId ? 'tree-row--cur' : ''}`}>
        {lastChain.map((isLast, i) => {
          const connector = i === lastChain.length - 1;
          const kind = connector ? (isLast ? 'corner' : 'branch') : (isLast ? 'empty' : 'vertical');
          return <span key={i} className={`tree-guide tree-guide--${kind}`} />;
        })}
        {hasChildren ? (
          <button className="tree-iconbtn" onClick={() => onToggle(id)} aria-label={expanded ? 'collapse' : 'expand'}>
            <span className="tree-iconbtn-icon"><NodeIcon kind={node.kind || 'svc'} size={15} /></span>
            <span className={`tree-iconbtn-caret ${expanded ? 'tree-iconbtn-caret--open' : ''}`}>▸</span>
          </button>
        ) : (
          <span className="tree-iconbtn tree-iconbtn--leaf"><NodeIcon kind={node.kind || 'svc'} size={15} /></span>
        )}
        <button className="tree-label" onClick={() => onJump(id)}>
          <span className="tree-name">{node.name}</span>
          <span className="tree-dot" style={{ background: statusColor }} />
        </button>
      </div>
      {hasChildren && expanded && children.map((c, idx) => (
        <TreeItem key={c.id} id={c.id} depth={depth + 1}
          lastChain={[...lastChain, idx === children.length - 1]}
          NODES={NODES} getChildren={getChildren} currentId={currentId}
          isCollapsed={isCollapsed} onToggle={onToggle} onJump={onJump} />
      ))}
    </>
  );
}

function Drawer({ open, onClose, onJumpNode, currentId, settingsActive, onOpenSettings, onCollapse }) {
  const { t } = useTranslation();
  const { NODES, getChildren } = useSorack();
  const isDesktop = useIsDesktop();

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
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

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

        {/* Node tree navigator. */}
        <div className="drawer-body drawer-tree" ref={treeRef}>
          {roots.length === 0 ? (
            <div className="drawer-tree-empty">{t('drawer.treeEmpty', { defaultValue: 'no nodes yet' })}</div>
          ) : roots.map((r) => (
            <TreeItem key={r.id} id={r.id} depth={0}
              NODES={NODES} getChildren={getChildren} currentId={currentId}
              isCollapsed={isCollapsed} onToggle={onToggle} onJump={jump} />
          ))}
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

  const statusColor = node
    ? (node.status === 'err' ? 'var(--err)' : node.status === 'warn' ? 'var(--warn)' : 'var(--ok)')
    : 'var(--fg-3)';

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

  const showPeekRow = !!node;

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
        {showPeekRow && (
          <div className="sheet-peek-row">
            <span className="sheet-peek-status" style={{ color: statusColor }}>
              <span className="sheet-peek-dot" style={{ background: statusColor }} />
              {t(`status.${node.status === 'ok' ? 'ok' : node.status === 'warn' ? 'warn' : 'err'}`)}
            </span>
            <span className="sheet-peek-sub">{node.subtitle}</span>
            <span className="sheet-peek-chev">⌃</span>
          </div>
        )}
        <div className="sheet-body" ref={bodyRef}>
          <NodeDetail nodeId={nodeId} onJumpNode={onJumpNode} onOpenRunbook={onOpenRunbook} onIdChange={onIdChange} onOpenInfraGallery={onOpenInfraGallery} onOpenSoftwareGallery={onOpenSoftwareGallery} />
        </div>
      </aside>
    </>
  );
}

// ─── Full-screen Search ────────────────────────────────────────────
function SearchOverlay({ open, onClose, onPickNode, onPickRunbook }) {
  const { t } = useTranslation();
  const { NODES, searchAll } = useSorack();
  const isDesktop = useIsDesktop();
  const [q, setQ] = useStateA('');
  const [cursor, setCursor] = useStateA(0);
  const inputRef = useRefA(null);
  const results = useMemoA(() => searchAll(q), [q]);

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
          createEdge, updateEdge, deleteEdge } = useSorack();
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
  const [alertsOpen, setAlertsOpen] = useStateA(false);

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
    document.documentElement.setAttribute('data-mood', theme === 'light' ? 'light-engineer' : 'dark-modern');
    localStorage.setItem('sorack-theme', theme);
  }, [theme]);

  // ⌘K shortcut (desktop)
  useEffectA(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Helper shared by the keyboard handlers below — we suppress global
  // shortcuts while the user is typing into a field so the native key
  // (delete-char, browser undo, etc) wins.
  const isTyping = isTypingEl;

  // Undo/redo, defined at component scope so both the keyboard shortcut
  // (below) and the on-screen buttons (mobile has no Cmd+Z) can call them.
  const doUndo = useCallbackA(async () => {
    const op = history.popUndo();
    if (!op) return;
    await history.suppress(async () => {
      try {
        if (op.type === 'update') await updateNode(op.id, op.before);
        else if (op.type === 'create') await deleteNode(op.payload.id);
        else if (op.type === 'delete') await createNode({
          id: op.node.id, type: op.node.type, name: op.node.name,
          parentId: op.node.parentId, status: op.node.status, meta: op.node.meta,
        });
      } catch (err) { console.error('undo failed:', err); return; }
    });
    history.pushRedo(op);
  }, [updateNode, createNode, deleteNode]);

  const doRedo = useCallbackA(async () => {
    const op = history.popRedo();
    if (!op) return;
    await history.suppress(async () => {
      try {
        if (op.type === 'update') await updateNode(op.id, op.after);
        else if (op.type === 'create') await createNode(op.payload);
        else if (op.type === 'delete') await deleteNode(op.node.id);
      } catch (err) { console.error('redo failed:', err); return; }
    });
    history.pushUndo(op);
  }, [updateNode, createNode, deleteNode]);

  // Live undo/redo availability for the buttons' disabled state.
  const [histAvail, setHistAvail] = useStateA(() => ({ undo: history.canUndo(), redo: history.canRedo() }));
  useEffectA(() => history.subscribe(() => setHistAvail({ undo: history.canUndo(), redo: history.canRedo() })), []);

  // Keyboard: Cmd/Ctrl+Z undo, Cmd+Shift+Z / Cmd+Y redo. Skipped while
  // typing so the browser's native field-level undo wins.
  useEffectA(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo]);

  // Delete removes the selected node (with the same confirm dialog the
  // right-click 'delete' uses). Backspace intentionally skipped — too
  // easy to fire by accident on macOS where it's also the back-nav key.
  useEffectA(() => {
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      if (!selectedId) return;
      if (e.key === 'Delete') {
        e.preventDefault();
        setConfirmDeleteId(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

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
  const openView = (id) => { setSelectedId(id); expandIfCollapsed(); };
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
    try {
      await createNode({
        id, type: 'host', name,
        parentId: parentId || null,
        status: 'unknown',
        meta: { idAuto: true },
      });
      openView(id);
    } catch (e) { console.error('create failed:', e); }
  };

  const openActions = (kind, opts) => setActionsCtx({ kind, ...opts });
  const closeActions = () => setActionsCtx(null);

  const requestDelete = (nodeId) => { setConfirmDeleteId(nodeId); };
  const doDelete = async () => {
    const id = confirmDeleteId; if (!id) return;
    try { await deleteNode(id); } catch (e) { console.error(e); }
    setConfirmDeleteId(null);
    if (selectedId === id) closeSheet();
  };

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
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={histAvail.undo}
        canRedo={histAvail.redo}
        undoIcon={Ic.undo}
        redoIcon={Ic.redo}
      />
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

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPickNode={onJumpNode}
        onPickRunbook={onOpenRunbook}
      />

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

