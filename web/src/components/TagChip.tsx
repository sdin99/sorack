// Reusable tag chip. Colors come from the deterministic hash in lib/tag-color
// so the same value renders the same color everywhere it appears. Optional
// onRemove turns the chip into a removable pill (X on the right); without it
// it's a static badge.
//
// Click handler is separate — used later by the filter chip row (Stage 2) to
// toggle the tag in/out of the active filter. Stage 1 doesn't pass onClick.

import * as React from "react";
import { tagHue } from "@/lib/tag-color";

export interface TagChipProps {
  value: string;
  onRemove?: () => void;
  onClick?: () => void;
  // Smaller pill for dense places (sidebar tree, future graph card). Default
  // false = the comfortable NodeDetail size.
  compact?: boolean;
  // Active highlight for filter usage (Stage 2). No effect on chrome
  // otherwise.
  active?: boolean;
  className?: string;
  title?: string;
}

export function TagChip({ value, onRemove, onClick, compact, active, className, title }: TagChipProps) {
  // CSS reads --tg-h and constructs HSL with theme-aware lightness.
  const style = { "--tg-h": tagHue(value) } as React.CSSProperties;
  const cn = [
    "tag-chip",
    compact ? "tag-chip--compact" : "",
    active ? "tag-chip--active" : "",
    onClick ? "tag-chip--clickable" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <span
      className={cn}
      style={style}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title ?? value}
    >
      <span className="tag-chip-lbl">{value}</span>
      {onRemove && (
        <button
          type="button"
          className="tag-chip-x"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="remove tag"
          tabIndex={-1}
        >
          ×
        </button>
      )}
    </span>
  );
}
