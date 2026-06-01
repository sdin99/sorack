// Runbook sidebar — replaces the original single-select filter strip. The
// shape consciously mirrors the topology sidebar's #9 search track:
//   - prominent "+ new" primary action
//   - multi-select chip filters per facet (category, status, tag)
//   - sort dropdown
//   - empty-state when filters return nothing
//   - keyboard nav (arrow up/down + Enter)
// @ts-nocheck — same scope as the rest of features/lab

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const STATE_LIST = ["planned", "in_progress", "completed", "rolled_back"] as const;
const CATEGORY_LIST = ["task", "sop", "incident", "postmortem", "design_doc"] as const;
type Sort = "updated_desc" | "title_asc";

// Small inline SVGs keep us off another icon dep. Each one's viewBox lines up
// so the group header chip column stays uniform.
export const CategoryIcon = ({ cat }: { cat: string }) => {
  switch (cat) {
    case "task":
      return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M5 8.5l2 2 4-4" /></svg>;
    case "sop":
      return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M10 2v3h3" /></svg>;
    case "incident":
      return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5L1.5 14h13L8 1.5z" /><path d="M8 6v4M8 11.5v.5" /></svg>;
    case "postmortem":
      return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="M8 4.5v4M8 11v.5" /></svg>;
    case "design_doc":
      return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13.5V12l8-8 1.5 1.5-8 8H3z" /><path d="M10 4l1.5-1.5L13 4l-1.5 1.5" /></svg>;
    default:
      return null;
  }
};

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4v14M4 11h14" /></svg>
);

function formatRelative(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d`;
  if (sec < 86400 * 365) return `${Math.floor(sec / (86400 * 30))}mo`;
  return `${Math.floor(sec / (86400 * 365))}y`;
}

export interface RunbookListTemplate {
  id: string;
  name: string;
  description: string;
}

interface Props {
  runbookId: string | null;
  runbooks: Record<string, any>;
  templates: RunbookListTemplate[];
  onJumpRunbook: (id: string) => void;
  onCreate: (payload: { title: string; templateId: string }) => Promise<void>;
}

export function RunbookList({ runbookId, runbooks, templates, onJumpRunbook, onCreate }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<Sort>("updated_desc");
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [selectedTpl, setSelectedTpl] = useState<string>(templates[0]?.id ?? "blank");
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const openCreate = () => { setCreateTitle(""); setSelectedTpl(templates[0]?.id ?? "blank"); setCreating(true); };
  const cancelCreate = () => { setCreating(false); setCreateTitle(""); setSubmitting(false); };
  const submitCreate = async () => {
    const title = createTitle.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    try { await onCreate({ title, templateId: selectedTpl }); cancelCreate(); }
    catch (e) { console.error("[runbook] create failed:", e); setSubmitting(false); }
  };

  const toggle = (s: Set<string>, v: string, setter: (n: Set<string>) => void) => {
    const next = new Set(s);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };
  const clearAll = () => { setCats(new Set()); setStates(new Set()); setTags(new Set()); setQuery(""); };

  // Tag universe — every distinct tag across runbooks, for the chip facet.
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const r of Object.values(runbooks) as any[]) for (const tg of (r.tags ?? []) as string[]) s.add(tg);
    return Array.from(s).sort();
  }, [runbooks]);

  const filtered = useMemo(() => {
    const list = Object.values(runbooks).filter((r: any) => {
      if (cats.size > 0 && !cats.has(r.category)) return false;
      if (states.size > 0 && !states.has(r.state)) return false;
      if (tags.size > 0) {
        const rTags = (r.tags ?? []) as string[];
        if (!Array.from(tags).every((t) => rTags.includes(t))) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        if (!`${r.title} ${r.summary ?? ""} ${r.md} ${((r.tags as string[]) ?? []).join(" ")}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    list.sort((a: any, b: any) => {
      if (sortBy === "title_asc") return String(a.title).localeCompare(String(b.title));
      // updated_desc — fall through to ISO string compare (descending)
      const au = a.updatedAt ?? a.updated ?? "";
      const bu = b.updatedAt ?? b.updated ?? "";
      return au < bu ? 1 : au > bu ? -1 : 0;
    });
    return list;
  }, [runbooks, cats, states, tags, query, sortBy]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const r of filtered) (g[r.category] = g[r.category] || []).push(r);
    return g;
  }, [filtered]);

  // Flat order for keyboard nav — matches the grouped render order.
  const flatIds = useMemo(() => {
    const ids: string[] = [];
    for (const cat of Object.keys(grouped)) for (const r of grouped[cat]) ids.push(r.id);
    return ids;
  }, [grouped]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!listRef.current?.contains(document.activeElement) && document.activeElement?.tagName !== "BODY") return;
      if (flatIds.length === 0) return;
      const cur = flatIds.indexOf(runbookId ?? "");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onJumpRunbook(flatIds[Math.min(flatIds.length - 1, cur + 1)] ?? flatIds[0]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onJumpRunbook(flatIds[Math.max(0, cur - 1)] ?? flatIds[0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flatIds, runbookId, onJumpRunbook]);

  const hasActiveFilters = cats.size > 0 || states.size > 0 || tags.size > 0 || query.length > 0;
  // Evergreen reference categories don't have an execution lifecycle, so
  // a colored dot (even if status happens to be set in DB from a prior
  // category) would mislead. Force grey for those.
  const categoryHasStatus = (c: string) => c !== "sop" && c !== "design_doc";
  const dotColor = (s: string) =>
    s === "in_progress" ? "var(--warn)"
    : s === "completed" ? "var(--ok)"
    : s === "rolled_back" ? "var(--err)"
    : "var(--fg-4)";
  const itemDotColor = (r: any) => categoryHasStatus(r.category) ? dotColor(r.state) : "var(--fg-4)";

  return (
    <div className="rb-list" ref={listRef}>
      <div className="rb-list-head">
        {!creating && (
          <button className="rb-list-new" onClick={openCreate}>
            <PlusIcon />
            <span>{t("runbook.new", { defaultValue: "New runbook" })}</span>
          </button>
        )}
        {creating && (
          <div className="rb-create-panel">
            <input
              className="rb-create-title"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitCreate(); }
                else if (e.key === "Escape") { cancelCreate(); }
              }}
              placeholder={t("runbook.newTitlePlaceholder", { defaultValue: "Title…" })}
              autoFocus
            />
            <div className="rb-create-tpl-label">{t("runbook.template.startFrom", { defaultValue: "Start from" })}</div>
            <div className="rb-create-tpl-list">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  className={`rb-create-tpl ${selectedTpl === tpl.id ? "rb-create-tpl--on" : ""}`}
                  onClick={() => setSelectedTpl(tpl.id)}
                  type="button"
                >
                  <span className="rb-create-tpl-name">{tpl.name}</span>
                  {tpl.description && <span className="rb-create-tpl-desc">{tpl.description}</span>}
                </button>
              ))}
            </div>
            <div className="rb-create-actions">
              <button className="rb-create-cancel" onClick={cancelCreate} type="button">
                {t("action.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                className="rb-create-submit"
                onClick={submitCreate}
                disabled={!createTitle.trim() || submitting}
                type="button"
              >
                {submitting ? "…" : t("action.create", { defaultValue: "Create" })}
              </button>
            </div>
          </div>
        )}
        <input
          className="rb-list-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("runbook.searchPlaceholder", { defaultValue: "Search…" })}
        />
      </div>

      <div className="rb-list-facets">
        <div className="rb-facet-row">
          {CATEGORY_LIST.map((c) => (
            <button
              key={c}
              className={`rb-chip rb-chip--cat ${cats.has(c) ? "rb-chip--on" : ""}`}
              onClick={() => toggle(cats, c, setCats)}
            >
              <CategoryIcon cat={c} />
              {t(`runbook.category.${c}`, { defaultValue: c })}
            </button>
          ))}
        </div>
        <div className="rb-facet-row">
          {STATE_LIST.map((s) => (
            <button
              key={s}
              className={`rb-chip rb-chip--state ${states.has(s) ? "rb-chip--on" : ""}`}
              onClick={() => toggle(states, s, setStates)}
            >
              <span className="rb-chip-dot" style={{ background: dotColor(s) }} />
              {t(`runbook.state.${s}`, { defaultValue: s })}
            </button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="rb-facet-row">
            {allTags.map((tg) => (
              <button
                key={tg}
                className={`rb-chip rb-chip--tag ${tags.has(tg) ? "rb-chip--on" : ""}`}
                onClick={() => toggle(tags, tg, setTags)}
              >
                #{tg}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rb-list-sortbar">
        <button
          className={`rb-sort ${sortBy === "updated_desc" ? "rb-sort--on" : ""}`}
          onClick={() => setSortBy("updated_desc")}
          title={t("runbook.sort.updated", { defaultValue: "Most recently updated" })}
        >
          ↓ updated
        </button>
        <button
          className={`rb-sort ${sortBy === "title_asc" ? "rb-sort--on" : ""}`}
          onClick={() => setSortBy("title_asc")}
          title={t("runbook.sort.title", { defaultValue: "Title A→Z" })}
        >
          A↓ title
        </button>
        <span className="rb-sort-spacer" />
        <span className="rb-sort-count">{filtered.length}</span>
      </div>

      <div className="rb-list-body">
        {filtered.length === 0 && (
          <div className="rb-list-empty">
            <div className="rb-list-empty-h">
              {Object.keys(runbooks).length === 0
                ? t("runbook.empty.none", { defaultValue: "No runbooks yet" })
                : t("runbook.empty.filtered", { defaultValue: "No runbooks match" })}
            </div>
            {hasActiveFilters && (
              <button className="rb-list-empty-clear" onClick={clearAll}>
                {t("runbook.empty.clear", { defaultValue: "Clear filters" })}
              </button>
            )}
          </div>
        )}
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="rb-group">
            <div className="rb-group-h">
              <CategoryIcon cat={cat} />
              <span className="rb-group-name">{t(`runbook.category.${cat}`, { defaultValue: cat })}</span>
              <span className="rb-group-c">{items.length}</span>
            </div>
            {items.map((r: any) => {
              const sev = r.meta?.severity ?? "";
              return (
                <button
                  key={r.id}
                  className={`rb-item ${r.id === runbookId ? "rb-item--active" : ""}`}
                  onClick={() => onJumpRunbook(r.id)}
                >
                  <span className="rb-item-dot" style={{ background: itemDotColor(r) }} title={categoryHasStatus(r.category) ? t(`runbook.state.${r.state}`, { defaultValue: r.state }) : t(`runbook.category.${r.category}`, { defaultValue: r.category })} />
                  <span className="rb-item-text">
                    <span className="rb-item-line1">
                      <span className="rb-item-title">{r.title}</span>
                      {sev && <span className={`rb-item-sev rb-item-sev--${sev}`}>{sev}</span>}
                    </span>
                    {r.summary && <span className="rb-item-summary">{r.summary}</span>}
                    {((r.nodeRefs ?? []) as string[]).length > 0 && (
                      <span className="rb-item-refs">
                        {((r.nodeRefs ?? []) as string[]).slice(0, 2).join(" · ")}
                        {((r.nodeRefs ?? []) as string[]).length > 2 && ` +${(r.nodeRefs as string[]).length - 2}`}
                      </span>
                    )}
                  </span>
                  <span className="rb-item-time">{formatRelative(r.updatedAt ?? "")}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
