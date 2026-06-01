// Reusable single-select dropdown. Replaces native <select> across sorack
// with a styled trigger + portal-rendered menu so the popup escapes
// overflow:hidden ancestors (CardGallery, sheets, etc.).
//
// Keyboard: Tab focuses; Enter / Space / ArrowDown opens; ArrowUp/Down moves
// highlight; Enter selects; Esc closes. All keyboard handling lives on the
// trigger so focus stays in one place; the portal menu just renders.
//
// Positioning: re-measure on open + resize + capture-phase scroll. Flips
// above the trigger if it would clip past the viewport bottom.
//
// Out of scope (MVP): search, multi-select, async loading, option groups.

import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  // Optional supporting bits — both layered into the option row so callers
  // can disambiguate same-named items (description) or show a visual
  // shorthand (icon = any ReactNode, e.g. a NodeIcon).
  description?: string;
  icon?: React.ReactNode;
}

export interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string; // extra class on the trigger button
  ariaLabel?: string;
  // Fires whenever the menu closes (click outside, Esc, or selection).
  // Lets callers wired into an edit-mode (e.g. EditableSpecRow) exit
  // editing when the user dismisses the dropdown without picking.
  onClose?: () => void;
}

type Placement = "below" | "above";
interface MenuPos { top: number; left: number; width: number; placement: Placement; }

export function Dropdown({
  value, onChange, options, placeholder, disabled, className, ariaLabel, onClose,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIdx = options.findIndex((o) => o.value === value);
  const selected = selectedIdx >= 0 ? options[selectedIdx] : undefined;

  const reposition = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 240;
    const menuW = menuRef.current?.offsetWidth ?? r.width;
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const placement: Placement = menuH > below && above > below ? "above" : "below";
    // Clamp horizontally so the menu doesn't extend past the right edge of
    // the viewport (happens when the trigger sits near the right side and
    // the menu is wider than the trigger). 8px gutter so the shadow has
    // breathing room.
    let left = r.left;
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuW - 8);
    }
    const top = placement === "below" ? r.bottom + 4 : r.top - 4;
    // Skip setState when nothing changed — required so the dep-less
    // useLayoutEffect below doesn't spin into an infinite re-render loop.
    setPos((prev) => {
      if (prev && prev.top === top && prev.left === left && prev.width === r.width && prev.placement === placement) {
        return prev;
      }
      return { top, left, width: r.width, placement };
    });
  };

  // Single dep-less useLayoutEffect: runs after every render while the menu
  // is open, so the second render (when menuRef is actually attached) gets
  // a true-width re-measure. The reposition guard above keeps this from
  // looping forever — once values settle, setPos returns prev and React
  // skips the next render.
  useLayoutEffect(() => { if (open) reposition(); });

  useEffect(() => {
    if (!open) return;
    const onMove = () => reposition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true); // capture = all scrollables
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      onClose?.();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  // Highlight tracks selected when opening; cleared on close.
  useEffect(() => {
    if (open) setHighlight(selectedIdx >= 0 ? selectedIdx : 0);
    else setHighlight(-1);
  }, [open, selectedIdx]);

  const moveHighlight = (dir: 1 | -1) => {
    setHighlight((h) => {
      let n = h;
      for (let i = 0; i < options.length; i++) {
        n = (n + dir + options.length) % options.length;
        if (!options[n]?.disabled) return n;
      }
      return h;
    });
  };

  const selectAt = (i: number) => {
    if (i < 0 || i >= options.length) return;
    const o = options[i];
    if (o.disabled) return;
    if (o.value !== value) onChange(o.value);
    setOpen(false);
    onClose?.();
    triggerRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      // Stop native bubbling so window-level keydown handlers (e.g. sheet
      // Esc-to-close) don't fire when the user is just dismissing the menu.
      e.stopPropagation();
      (e.nativeEvent as any)?.stopImmediatePropagation?.();
      setOpen(false);
      onClose?.();
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); moveHighlight(1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); moveHighlight(-1); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectAt(highlight); return; }
    if (e.key === "Tab") { setOpen(false); /* allow tab to move focus */ }
  };

  const triggerLabel = selected?.label ?? placeholder ?? "";

  const menu = open && pos ? createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label={ariaLabel}
      className={`sd-dropdown-menu sd-dropdown-menu--${pos.placement}`}
      style={{
        position: "fixed",
        top: pos.placement === "below" ? pos.top : undefined,
        bottom: pos.placement === "above" ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        minWidth: pos.width,
      }}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="option"
          aria-selected={o.value === value}
          disabled={o.disabled}
          tabIndex={-1}
          className={
            "sd-dropdown-opt" +
            (i === highlight ? " sd-dropdown-opt--active" : "") +
            (o.value === value ? " sd-dropdown-opt--selected" : "")
          }
          onMouseEnter={() => !o.disabled && setHighlight(i)}
          // mousedown (not click) so the option fires before the document
          // mousedown listener that closes on outside clicks.
          onMouseDown={(e) => { e.preventDefault(); selectAt(i); }}
        >
          {o.icon && <span className="sd-dropdown-opt-icon" aria-hidden="true">{o.icon}</span>}
          <span className="sd-dropdown-opt-lbl">{o.label}</span>
          {o.description && <span className="sd-dropdown-opt-desc">{o.description}</span>}
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`sd-dropdown${open ? " sd-dropdown--open" : ""}${className ? " " + className : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        {selected?.icon && <span className="sd-dropdown-trigger-icon" aria-hidden="true">{selected.icon}</span>}
        <span className="sd-dropdown-label">{triggerLabel}</span>
        <svg
          className="sd-dropdown-caret"
          width="14" height="14" viewBox="0 0 22 22"
          fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 8l6 6 6-6" />
        </svg>
      </button>
      {menu}
    </>
  );
}
