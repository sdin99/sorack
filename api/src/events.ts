// App-wide event bus for SSE broadcasting. Anything that wants to push to
// connected clients (file watcher, route handlers, future collector hooks)
// imports `emitEvent` and pushes a tagged payload; the /api/events stream
// route subscribes and forwards.
//
// Message shape: `{ type: string, ...payload }`. The type prefix groups
// related events (`runbook.changed`, `node.status_changed`, etc.) so the
// client can listen per-domain.

import { EventEmitter } from "node:events";

export interface SorackEvent {
  type: string;
  [key: string]: unknown;
}

export const eventBus = new EventEmitter();
// Each SSE connection adds one listener and lives for the session — bump
// the default 10-listener warning ceiling so it stays silent at modest
// concurrency.
eventBus.setMaxListeners(200);

export function emitEvent(ev: SorackEvent): void {
  eventBus.emit("event", ev);
}
