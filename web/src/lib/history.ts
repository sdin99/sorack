// In-memory undo/redo stack for node mutations.
//
// Wrapped around the create/update/delete mutation calls in SorackData
// so every write the user makes pushes an inverse op onto the stack.
// Cmd/Ctrl+Z applies the inverse; Cmd+Shift+Z or Cmd/Ctrl+Y replays.
// State lives at module scope (single-user dashboard) so the history
// survives component remounts but resets on full page reload.

import type { ApiNode, NodeCreatePayload, NodeUpdatePayload } from "./data-source/api";

// Single mutation captured for inverse application.
export type AtomicOp =
  | { type: "update"; id: string; before: NodeUpdatePayload; after: NodeUpdatePayload }
  | { type: "create"; payload: NodeCreatePayload }
  // Full node snapshot so we can recreate it on undo with the same fields.
  | { type: "delete"; node: ApiNode };

// Either an atomic op or a batch (bulk action) that should undo/redo as one
// logical step. Batches don't nest — `ops` is always atomic.
export type Op = AtomicOp | { type: "batch"; ops: AtomicOp[] };

const MAX = 100;

const undoStack: Op[] = [];
const redoStack: Op[] = [];
const listeners = new Set<() => void>();
let suppressed = 0;

function notify() { for (const fn of listeners) fn(); }

function trim(stack: Op[]) {
  if (stack.length > MAX) stack.splice(0, stack.length - MAX);
}

export const history = {
  push(op: Op) {
    if (suppressed > 0) return;
    undoStack.push(op);
    redoStack.length = 0;
    trim(undoStack);
    notify();
  },
  // Push a batch of atomic ops as one logical history entry. A single ⌘Z
  // undoes them all (in reverse order). Single-op batches are unwrapped to
  // a plain atomic entry to avoid pointless wrapping.
  pushBatch(ops: AtomicOp[]) {
    if (suppressed > 0) return;
    if (ops.length === 0) return;
    if (ops.length === 1) undoStack.push(ops[0]);
    else undoStack.push({ type: "batch", ops });
    redoStack.length = 0;
    trim(undoStack);
    notify();
  },
  popUndo(): Op | undefined {
    const op = undoStack.pop();
    if (op) notify();
    return op;
  },
  popRedo(): Op | undefined {
    const op = redoStack.pop();
    if (op) notify();
    return op;
  },
  pushRedo(op: Op) { redoStack.push(op); trim(redoStack); notify(); },
  pushUndo(op: Op) { undoStack.push(op); trim(undoStack); notify(); },
  canUndo() { return undoStack.length > 0; },
  canRedo() { return redoStack.length > 0; },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  // Suspend recording while an inverse is being applied — otherwise the
  // undo's own mutation would push another op and the stack would
  // never make progress. Re-entrant via a counter.
  async suppress<T>(fn: () => Promise<T>): Promise<T> {
    suppressed++;
    try { return await fn(); }
    finally { suppressed--; }
  },
};
