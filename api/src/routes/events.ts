// /api/events — long-lived SSE stream broadcasting app events to the
// connected client (UI). Each browser tab opens one EventSource; chokidar
// emits → eventBus → this handler writes to the stream → React Query
// invalidations in the client.
//
// Auth: mounted under /api/* which already runs requireAuth. EventSource
// sends the session cookie automatically (same-origin).

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eventBus, type SorackEvent } from "../events";

export const eventsRoutes = new Hono();

eventsRoutes.get("/", (c) =>
  streamSSE(c, async (stream) => {
    const onEvent = (ev: SorackEvent) => {
      // Fire-and-forget — Hono buffers writes; awaiting here would block
      // the emitter's other listeners.
      stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) }).catch(() => {});
    };
    eventBus.on("event", onEvent);

    // Heartbeat — keeps proxies (Cloudflare, Traefik) from idling out the
    // connection. Also lets the client notice silent disconnects.
    const hb = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
    }, 25_000);

    stream.onAbort(() => {
      eventBus.off("event", onEvent);
      clearInterval(hb);
    });

    // Tell the client we're alive. The client uses this to do a full
    // invalidate-on-reconnect — anything missed during the disconnect
    // window gets refetched naturally.
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ at: new Date().toISOString() }),
    });

    // Keep the handler alive until the client aborts. Hono returns from
    // streamSSE when this promise resolves; an unresolving promise is the
    // idiomatic way to hold the connection open.
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve());
    });
  })
);
