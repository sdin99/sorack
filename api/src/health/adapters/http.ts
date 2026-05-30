// HTTP probe — the most universal health check (any service with a URL).
// Uses the global fetch + the collector's AbortSignal for timeout/shutdown.

import type { ProbeAdapter, ProbeConfig, ProbeContext, ProbeResult } from "../types";

interface HttpProbe extends ProbeConfig {
  url: string;
  expect?: number | number[]; // default: any 2xx
  method?: string; // default GET
}

export const httpAdapter: ProbeAdapter = {
  type: "http",
  async probe(config: ProbeConfig, ctx: ProbeContext): Promise<ProbeResult> {
    const c = config as HttpProbe;
    if (!c.url || typeof c.url !== "string") {
      return { status: "unknown", message: "http probe missing url" };
    }
    const start = performance.now();
    try {
      const res = await fetch(c.url, {
        method: c.method ?? "GET",
        signal: ctx.signal,
        // A redirect (e.g. to a login page) isn't "healthy" unless the
        // operator explicitly expects that code.
        redirect: "manual",
      });
      const latencyMs = Math.round(performance.now() - start);
      const ok = matchExpect(res.status, c.expect);
      return { status: ok ? "ok" : "err", latencyMs, message: `HTTP ${res.status}` };
    } catch (e) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        status: "err",
        latencyMs,
        message: ctx.signal.aborted ? `timeout after ${ctx.timeoutMs}ms` : errMsg(e),
      };
    }
  },
};

function matchExpect(status: number, expect?: number | number[]): boolean {
  if (expect == null) return status >= 200 && status < 300;
  return (Array.isArray(expect) ? expect : [expect]).includes(status);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
