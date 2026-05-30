// Phase 3B (revised) — context menu (right-click on node or pane) and
// confirm dialog. The menu floats at the cursor on desktop right-click
// and centers on mobile (kebab tap). Each item gets an icon for
// scannability.
// @ts-nocheck — same scope as App.

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  hint?: string;       // small monospace hint right-aligned
  danger?: boolean;
  disabled?: boolean;  // dimmed + non-interactive (e.g. duplicate already exists)
  divider?: boolean;   // pseudo-item: render a divider above this one
  onClick: () => void;
}

interface ActionMenuProps {
  open: boolean;
  position?: { x: number; y: number } | null;
  onClose: () => void;
  items: ActionMenuItem[];
  title?: string;
}

export function ActionMenu({ open, position, onClose, items, title }: ActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Defer the listener registration to the next frame so the same
    // mousedown that opened the menu doesn't immediately close it.
    const id = requestAnimationFrame(() => document.addEventListener("mousedown", onDocDown));
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const PAD = 8;
  const W = 220;
  const H = items.length * 40 + (title ? 36 : 0) + 16;
  const style: React.CSSProperties = position
    ? {
        position: "fixed",
        left: Math.max(PAD, Math.min(position.x, window.innerWidth - W - PAD)),
        top: Math.max(PAD, Math.min(position.y, window.innerHeight - H - PAD)),
      }
    : {};

  return (
    <>
      <div className={`action-backdrop ${position ? "action-backdrop--popover" : ""}`} onClick={onClose} />
      <div
        ref={ref}
        className={`action-menu ${position ? "action-menu--popover" : "action-menu--center"}`}
        style={style}
        role="menu"
      >
        {title && <div className="action-menu-title">{title}</div>}
        {items.map((it) => (
          <div key={it.key}>
            {it.divider && <div className="action-menu-divider" />}
            <button
              className={`action-menu-item ${it.danger ? "action-menu-item--danger" : ""} ${it.disabled ? "action-menu-item--disabled" : ""}`}
              onClick={() => { if (!it.disabled) it.onClick(); }}
              disabled={it.disabled}
              role="menuitem"
            >
              {it.icon && <span className="action-menu-icon">{it.icon}</span>}
              <span className="action-menu-label">{it.label}</span>
              {it.hint && <span className="action-menu-hint">{it.hint}</span>}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmLabel, danger, onCancel, onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-card">
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="nf-btn" onClick={onCancel}>{t("action.cancel")}</button>
          <button className={`nf-btn ${danger ? "nf-btn--danger" : "nf-btn--primary"}`} onClick={onConfirm} autoFocus>
            {confirmLabel ?? t("action.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
