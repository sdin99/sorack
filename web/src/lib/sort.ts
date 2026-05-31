// Sort siblings by user-set order, falling back to alphabetical by name.
// `meta.orderIdx` is assigned on create (siblings.max + 1000) and updated by
// drag-to-reorder. Nodes without orderIdx fall behind ordered ones and sort
// alpha among themselves — this matters for old data created before order
// tracking landed.

export function siblingSort(a: any, b: any): number {
  const ai = a?.meta?.orderIdx;
  const bi = b?.meta?.orderIdx;
  const aHas = typeof ai === "number";
  const bHas = typeof bi === "number";
  if (aHas && bHas) return ai - bi;
  if (aHas) return -1;
  if (bHas) return 1;
  return (a?.name || a?.id || "").localeCompare(b?.name || b?.id || "");
}

// Compute a fresh orderIdx for a new node appended to a parent's children.
// 1000-step gaps leave room for midpoint insertions before a reflow is
// needed.
export function nextOrderIdx(siblings: any[]): number {
  let max = 0;
  for (const s of siblings) {
    const idx = s?.meta?.orderIdx;
    if (typeof idx === "number" && idx > max) max = idx;
  }
  return max + 1000;
}

// Returns the orderIdx values to assign so a new (or reparented) node is
// the last child of `siblings`, normalising the existing list along the way
// if some have no orderIdx. Output: { reflowItems, newOrderIdx }.
//   - reflowItems: bulk-update payload to normalise siblings' orderIdx, or
//     [] if no normalisation needed.
//   - newOrderIdx: the orderIdx to apply to the appended node.
export function appendToSiblings(siblings: any[]): {
  reflowItems: Array<{ id: string; patch: any }>;
  newOrderIdx: number | undefined;
} {
  if (siblings.length === 0) return { reflowItems: [], newOrderIdx: undefined };
  const sorted = siblings.slice().sort(siblingSort);
  const anyMissing = sorted.some((n) => typeof n?.meta?.orderIdx !== "number");
  if (anyMissing) {
    // Reflow ALL siblings to multiples of 1000 in current visible order, so
    // a freshly-appended node with max + 1000 lands cleanly at the bottom.
    const reflowItems = sorted.map((n, i) => ({ id: n.id, patch: { meta: { orderIdx: (i + 1) * 1000 } } }));
    return { reflowItems, newOrderIdx: (sorted.length + 1) * 1000 };
  }
  return { reflowItems: [], newOrderIdx: nextOrderIdx(sorted) };
}
