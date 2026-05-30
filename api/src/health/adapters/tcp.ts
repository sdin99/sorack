// TCP probe — "is this port open" via a connect attempt. The unprivileged,
// portable stand-in for ICMP ping (which needs raw sockets / CAP_NET_RAW).

import net from "node:net";
import type { ProbeAdapter, ProbeConfig, ProbeContext, ProbeResult } from "../types";

interface TcpProbe extends ProbeConfig {
  host: string;
  port: number;
}

// Resolve the connect host: prefer the explicit probe host, fall back to the
// node's own manual.ip. The fallback mirrors what proxmox already does — one
// place to edit the IP (manual.ip), every probe target reuses it.
function resolveHost(c: TcpProbe, ctx: ProbeContext): string | undefined {
  if (c.host && typeof c.host === "string" && c.host.trim()) return c.host.trim();
  const manualIp = (ctx.node?.meta as Record<string, unknown> | undefined)?.manual as
    | Record<string, unknown>
    | undefined;
  const ip = manualIp?.ip;
  return typeof ip === "string" && ip.trim() ? ip.trim() : undefined;
}

export const tcpAdapter: ProbeAdapter = {
  type: "tcp",
  probe(config: ProbeConfig, ctx: ProbeContext): Promise<ProbeResult> {
    const c = config as TcpProbe;
    const host = resolveHost(c, ctx);
    if (!host || typeof c.port !== "number") {
      return Promise.resolve({ status: "unknown", message: "tcp probe needs host + port (or set manual.ip)" });
    }
    const start = performance.now();
    return new Promise<ProbeResult>((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (r: ProbeResult): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(r);
      };
      const latency = (): number => Math.round(performance.now() - start);

      socket.setTimeout(ctx.timeoutMs);
      socket.once("connect", () => done({ status: "ok", latencyMs: latency(), message: "connected" }));
      socket.once("timeout", () =>
        done({ status: "err", latencyMs: latency(), message: `timeout after ${ctx.timeoutMs}ms` }),
      );
      socket.once("error", (e) => done({ status: "err", latencyMs: latency(), message: e.message }));
      ctx.signal.addEventListener("abort", () => done({ status: "unknown", message: "aborted" }), {
        once: true,
      });

      socket.connect(c.port, host);
    });
  },
};
