// @ts-nocheck — Phase 1 마이그: 시안 그대로 동작 우선, 타입은 점진 강화.
// simple monoline SVG icons keyed by node kind.

import type { ReactNode } from "react";

const NODE_ICON_PATHS: Record<string, ReactNode> = {
  router: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="10" width="14" height="6" rx="1" />
      <path d="M5 10V6m8 4V6" />
      <path d="M4 5l1.5-2M14 5l-1.5-2" />
      <circle cx="6" cy="13.2" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13.2" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13.2" r="0.6" fill="currentColor" stroke="none" />
    </g>
  ),
  host: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="3" width="14" height="5" rx="1" />
      <rect x="2" y="10" width="14" height="5" rx="1" />
      <circle cx="4.6" cy="5.5" r="0.65" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="12.5" r="0.65" fill="currentColor" stroke="none" />
      <path d="M8 5.5h5M8 12.5h5" />
    </g>
  ),
  vm: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2.5" y="3" width="13" height="9" rx="1" strokeDasharray="2 1.6" />
      <rect x="5.5" y="5.5" width="7" height="4" rx="0.5" />
      <path d="M6.5 14.5h5M9 12.5v2" />
    </g>
  ),
  ct: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 5.2l6-2.4 6 2.4v7.6l-6 2.4-6-2.4V5.2z" />
      <path d="M3 5.2l6 2.4 6-2.4M9 7.6v8" />
    </g>
  ),
  ns: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M9 2l6 3.4v7.2L9 16 3 12.6V5.4L9 2z" />
      <circle cx="9" cy="9" r="2.1" />
    </g>
  ),
  svc: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2.5" y="6.5" width="13" height="6" rx="1" />
      <path d="M2.5 9.5h13" />
      <path d="M5 6.5V4M9 6.5V3M13 6.5V4" />
    </g>
  ),
  pvc: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="9" cy="4" rx="6" ry="1.8" />
      <path d="M3 4v10c0 1 2.7 1.8 6 1.8s6-.8 6-1.8V4" />
      <path d="M3 8.2c0 1 2.7 1.8 6 1.8s6-.8 6-1.8" opacity="0.55" />
      <path d="M3 11.6c0 1 2.7 1.8 6 1.8s6-.8 6-1.8" opacity="0.35" />
    </g>
  ),
  share: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M2.5 5.5h4.5l1.5 2H15.5v7.5H2.5V5.5z" />
      <circle cx="12.6" cy="11" r="1.2" />
      <circle cx="8" cy="11.5" r="1" />
      <path d="M9 11h2.4" />
    </g>
  ),
};

export function NodeIcon({
  kind,
  size = 16,
  className,
  color,
}: {
  kind: string;
  size?: number;
  className?: string;
  color?: string;
}) {
  const p = NODE_ICON_PATHS[kind] || NODE_ICON_PATHS.svc;
  return (
    <svg
      viewBox="0 0 18 18"
      width={size}
      height={size}
      className={className}
      style={color ? { color } : undefined}
      aria-hidden="true"
    >
      {p}
    </svg>
  );
}
