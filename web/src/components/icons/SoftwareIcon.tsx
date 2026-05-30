// Software brand-logo icon backed by the simple-icons package (CC0). Map
// ties each id in the SOFTWARE registry (node-detail-schema.ts) to its
// upstream icon — adding a new software with a logo = one named import +
// one map entry.
//
// In the gallery cards we pass brand=true so the official brand hex is used
// (so the catalog reads like Grafana's add-data-source page). In small
// graph-node badges we leave brand=false so the icon takes currentColor and
// blends with the node surface.

import * as React from "react";
import { siPostgresql, siJellyfin, siAdguard, siProxmox } from "simple-icons";

interface SimpleIconShape { path: string; hex: string; title: string; }

const SOFTWARE_ICON: Record<string, SimpleIconShape> = {
  postgresql: siPostgresql,
  jellyfin: siJellyfin,
  adguard: siAdguard,
  "proxmox-ve": siProxmox,
};

export function SoftwareIcon({
  id,
  size = 16,
  brand = false,
  className,
}: {
  id: string;
  size?: number;
  brand?: boolean;
  className?: string;
}) {
  const icon = SOFTWARE_ICON[id];
  if (!icon) return null;
  const fill = brand ? `#${icon.hex}` : "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={icon.title}
    >
      <path d={icon.path} fill={fill} />
    </svg>
  );
}

// Caller-facing predicate so card/badge renderers can choose to fall back
// (text initial, generic shape, …) when a software id has no logo yet.
export function hasSoftwareIcon(id: string): boolean {
  return id in SOFTWARE_ICON;
}
