// Card gallery picker with drill-down. One component, two modes:
//   - "infra"    : single-select (one infra type per node).
//   - "software" : multi-toggle (a node can run several).
//
// Two views inside one modal (B-1/B-2 v3):
//   - grid:   category-grouped cards. The PRIMARY action is selection, so
//             clicking a card body (or Enter) commits the pick (infra) or
//             toggles (software). A small ⚙ button in the card's top-right
//             corner is the secondary affordance that drills into the
//             detail view — for browsing the description, the field
//             template, and (current type only) the monitoring settings.
//   - detail: icon/name/category/description + field preview + optional
//             caller-provided extra slot (B-2: monitoring control for the
//             current type's card). A back button returns to the grid; the
//             same select/toggle action lives here too as a larger button.
//
// Callers can also jump straight into a detail view by passing `openDetailId`
// (e.g. NodeDetail's StatusLine ⚙ + `+` buttons — skip the grid).
//
// The caller builds `items` (id/name/category + optional description/entries)
// in the order it wants categories to appear.

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { NodeIcon } from "@/components/icons/NodeIcon";
import { SoftwareIcon, hasSoftwareIcon } from "@/components/icons/SoftwareIcon";
import { GearIcon } from "@/components/icons/GearIcon";
import { iconForType } from "@/lib/icon-map";
import { isWidget, type DetailEntry } from "./node-detail-schema";

export type GalleryMode = "infra" | "software";

export interface CardItem {
  id: string;
  name: string;
  category: string;
  description?: string;
  entries?: DetailEntry[]; // for the detail view's field preview
}

interface CardGalleryProps {
  open: boolean;
  mode: GalleryMode;
  title: string;
  items: CardItem[];
  selectedIds: string[]; // single-element [current] for infra, full array for software
  onSelect: (id: string) => void;
  onClose: () => void;
  // Optional: open straight into a card's detail view (skip the grid).
  // Used by NodeDetail's monitoring summary line — clicking it should land on
  // the current type's detail card, not the grid.
  openDetailId?: string;
  // Optional: extra content rendered inside a card's detail view, between the
  // description and the field preview. B-2 uses this for the monitoring
  // (probe) control on the current type's card only.
  renderDetailExtra?: (itemId: string) => React.ReactNode;
}

// Card icon: software uses its brand logo when available, else the generic
// type-derived NodeIcon shape.
function CardIcon({ mode, id, size }: { mode: GalleryMode; id: string; size: number }) {
  if (mode === "software" && hasSoftwareIcon(id)) return <SoftwareIcon id={id} size={size} brand />;
  return <NodeIcon kind={iconForType(id)} size={size} />;
}

export function CardGallery({ open, mode, title, items, selectedIds, onSelect, onClose, openDetailId, renderDetailExtra }: CardGalleryProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null); // null = grid view
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh search + initial view + focus each time the gallery opens. When the
  // caller passes openDetailId we land in that card's detail view; otherwise
  // grid. The back button + Esc still return to grid as usual.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDetailId(openDetailId ?? null);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, openDetailId]);

  // Esc: from detail → back to grid; from grid → close. Capture phase +
  // stopImmediatePropagation so the gallery consumes the keystroke before it
  // reaches other Esc handlers (e.g. the detail panel's close-on-Esc), which
  // would otherwise close the whole panel behind the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (detailId) setDetailId(null); // back to grid
      else onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, onClose, detailId]);

  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      it.id.toLowerCase().includes(q)
      || it.name.toLowerCase().includes(q)
      || it.category.toLowerCase().includes(q)
      || (it.description ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  // Group by category, preserving the input array order for both group order
  // and within-group order (caller decides).
  const groups = useMemo(() => {
    const map = new Map<string, CardItem[]>();
    for (const it of filtered) {
      const list = map.get(it.category) ?? [];
      list.push(it);
      map.set(it.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const detailItem = useMemo(
    () => (detailId ? items.find((it) => it.id === detailId) ?? null : null),
    [detailId, items],
  );

  if (!open) return null;

  // The select control shared by card + detail. infra = pick & close, software
  // = toggle & stay (so several can be flipped).
  const renderSelectButton = (it: CardItem, big = false) => {
    const isSelected = selSet.has(it.id);
    const label = isSelected
      ? mode === "software"
        ? t("nd.galleryRemove", { defaultValue: "Remove" })
        : t("nd.gallerySelected", { defaultValue: "Selected" })
      : mode === "software"
        ? t("nd.galleryAdd", { defaultValue: "Add" })
        : t("nd.gallerySelect", { defaultValue: "Select" });
    return (
      <button
        className={`gallery-pick ${big ? "gallery-pick--lg" : ""} ${isSelected ? "gallery-pick--on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(it.id);
          if (mode === "infra") onClose();
        }}
        type="button"
      >
        {label}
      </button>
    );
  };

  // Portal to document.body so the backdrop always covers the full viewport.
  return createPortal((
    <div
      className="gallery-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="gallery-panel" role="dialog" aria-modal="true">
        <div className="gallery-head">
          {detailItem && (
            <button className="gallery-back" onClick={() => setDetailId(null)} aria-label="back" type="button">‹</button>
          )}
          <div className="gallery-title">{detailItem ? detailItem.name : title}</div>
          <button className="gallery-close" onClick={onClose} aria-label="close" type="button">✕</button>
        </div>

        {detailItem ? (
          /* ── Detail view ── */
          <div className="gallery-detail">
            <div className="gallery-detail-head">
              <span className="gallery-detail-icon"><CardIcon mode={mode} id={detailItem.id} size={40} /></span>
              <div className="gallery-detail-meta">
                <div className="gallery-detail-name">{detailItem.name}</div>
                <div className="gallery-detail-cat">{detailItem.category}</div>
              </div>
              {renderSelectButton(detailItem, true)}
            </div>
            {detailItem.description && <p className="gallery-detail-desc">{detailItem.description}</p>}
            {detailItem.entries && detailItem.entries.length > 0 && (
              <div className="gallery-detail-fields">
                <div className="gallery-detail-fields-h">{t("nd.galleryFields", { defaultValue: "Fields" })}</div>
                {detailItem.entries.map((e, i) =>
                  isWidget(e) ? null : (
                    <div className="gallery-field" key={i}>
                      <span className="gallery-field-label">{(e as any).label}</span>
                      <span className="gallery-field-src">{(e as any).source}</span>
                    </div>
                  ),
                )}
              </div>
            )}
            {renderDetailExtra && renderDetailExtra(detailItem.id)}
          </div>
        ) : (
          /* ── Grid view ── */
          <>
            <div className="gallery-search-wrap">
              <input
                ref={inputRef}
                className="gallery-search"
                placeholder={t("nd.gallerySearch", { defaultValue: "Search…" })}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="gallery-cats">
              {groups.length === 0 ? (
                <div className="gallery-empty">{t("nd.galleryNoMatch", { defaultValue: "No matches" })}</div>
              ) : groups.map(([cat, list]) => (
                <div className="gallery-cat" key={cat}>
                  <div className="gallery-cat-h">{cat}</div>
                  <div className="gallery-grid">
                    {list.map((it) => {
                      const isSelected = selSet.has(it.id);
                      const cardLabel = isSelected
                        ? mode === "software"
                          ? t("nd.galleryRemove", { defaultValue: "Remove" })
                          : t("nd.gallerySelected", { defaultValue: "Selected" })
                        : mode === "software"
                          ? t("nd.galleryAdd", { defaultValue: "Add" })
                          : t("nd.gallerySelect", { defaultValue: "Select" });
                      const pick = () => {
                        onSelect(it.id);
                        if (mode === "infra") onClose();
                      };
                      return (
                        <div
                          key={it.id}
                          className={`gallery-card ${isSelected ? "gallery-card--selected" : ""}`}
                          onClick={pick}
                          role="button"
                          tabIndex={0}
                          aria-pressed={mode === "software" ? isSelected : undefined}
                          title={cardLabel}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}
                        >
                          {/* Top-right ⚙ drills into the detail view (secondary
                              affordance — primary is card click = select). */}
                          <button
                            className="gallery-detail-btn"
                            onClick={(e) => { e.stopPropagation(); setDetailId(it.id); }}
                            type="button"
                            aria-label={t("nd.galleryOpenDetail", { defaultValue: "open details" })}
                            title={t("nd.galleryOpenDetail", { defaultValue: "open details" })}
                          >
                            <GearIcon size={14} />
                          </button>
                          <span className="gallery-card-icon"><CardIcon mode={mode} id={it.id} size={28} /></span>
                          <span className="gallery-card-name">{it.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body);
}
