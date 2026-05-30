// ASCII slug for node ids. Strips non-ascii (Korean etc) since ids
// flow through URLs and DB primary keys — keep them stable and
// portable. Empty result means the caller should pick a fallback.
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// First-fit unique id derived from `base`: returns base, or base-1,
// base-2, … until one is unused. `taken` is the set/array of existing
// ids to avoid.
export function uniqueSlug(base: string, taken: { has?: (k: string) => boolean; includes?: (k: string) => boolean }): string {
  const exists = (id: string) =>
    typeof (taken as any).has === "function"
      ? (taken as any).has(id)
      : (taken as any).includes(id);
  if (!exists(base)) return base;
  let i = 1;
  while (exists(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
