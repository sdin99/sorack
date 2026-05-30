// Proxmox VE probe — PVE host node status + resource metrics.
//
// Model: only the PVE *host* node carries a proxmox probe. Guests (VMs/CTs)
// are separate inventory nodes that get their own reachability probes
// (tcp/http) — they don't each call the Proxmox API. This keeps the endpoint
// addressing simple (one host = one IP) and mirrors the k8s adapter, where a
// namespace node summarizes its workloads rather than each pod probing the
// API. A later iteration can add a guest summary (VM/CT counts + list) to the
// host's observed data, and eventually auto-discovery via ProbeResult.discovered.
//
// Like the k8s adapter this returns `observed.metrics` (cpu/mem/disk) for the
// detail panel's gauges widget, plus a humanized uptime field.
//
// Endpoint: the PVE host address comes from the node's own manual.ip (set in
// the inventory), so no per-node IP wrangling — falls back to
// SORACK_PROXMOX_HOST when the node has no ip. Auth comes from the environment
// so the adapter stays credential-neutral:
//   - SORACK_PROXMOX_USER  = "user@realm!tokenid"   (token id, no secret)
//   - SORACK_PROXMOX_TOKEN = the token secret (UUID)
// joined into the PVEAPIToken header as "user@realm!tokenid=secret". When auth
// is unset the adapter degrades to "unknown" instead of erroring.
//
// Zero runtime deps (node:https). Proxmox ships a self-signed cert by default;
// TLS verification stays ON unless SORACK_PROXMOX_INSECURE=true.

import https from "node:https";
import type { HealthStatus, ProbeAdapter, ProbeConfig, ProbeContext, ProbeResult } from "../types";

interface ProxmoxProbe extends ProbeConfig {
  node?: string; // PVE node name; falls back to SORACK_PROXMOX_NODE
  host?: string; // optional explicit endpoint; else node.meta.manual.ip / env
}

interface PveAuth {
  token: string; // assembled "user@realm!tokenid=secret"
  insecure: boolean;
}

// Auth from env (user id + secret kept separate per request). Returns null
// when not configured so the adapter degrades gracefully.
function pveAuth(): PveAuth | null {
  const user = process.env.SORACK_PROXMOX_USER;
  const secret = process.env.SORACK_PROXMOX_TOKEN;
  if (!user || !secret) return null;
  return { token: `${user}=${secret}`, insecure: process.env.SORACK_PROXMOX_INSECURE === "true" };
}

// GET /api2/json{path}, returns the unwrapped `data` payload. Rejects on
// non-2xx or transport error so the caller maps it to an "err" result.
function pveGet<T = any>(
  endpoint: string,
  path: string,
  auth: PveAuth,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  const [hostname, portStr] = endpoint.split(":");
  const port = portStr ? Number(portStr) : 8006;
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: hostname,
        port,
        path: `/api2/json${path}`,
        method: "GET",
        headers: { Authorization: `PVEAPIToken=${auth.token}`, Accept: "application/json" },
        rejectUnauthorized: !auth.insecure,
        signal,
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const code = res.statusCode ?? 0;
          if (code < 200 || code >= 300) {
            reject(new Error(`proxmox ${code} on ${path}: ${body.slice(0, 160)}`));
            return;
          }
          try {
            resolve((JSON.parse(body) as { data: T }).data);
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`proxmox timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

// bytes → GiB, one decimal. Returns undefined for missing/zero-ish inputs so a
// partial response doesn't render a "0 GB" gauge.
function gib(bytes: unknown): number | undefined {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  return Math.round((bytes / 2 ** 30) * 10) / 10;
}

// {used,total,unit} gauge cell — only when total is known.
function sizeMetric(used: unknown, total: unknown): { used: number; total: number; unit: string } | undefined {
  const t = gib(total);
  if (t === undefined) return undefined;
  const u = gib(used) ?? 0;
  return { used: u, total: t, unit: "GB" };
}

function cpuMetric(cpu: unknown): { pct: number } | undefined {
  if (typeof cpu !== "number" || !Number.isFinite(cpu)) return undefined;
  return { pct: Math.round(cpu * 100 * 10) / 10 };
}

function humanizeUptime(sec: unknown): string | undefined {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return undefined;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// SOFTWARE-AXIS observed for proxmox-ve. The PVE API surface gets used here
// only for fields the SOFTWARE template owns: pveVersion (/version) and the
// guest counts (/nodes/{node}/qemu, /lxc). HOST-axis identity (os / kernel /
// uptime / metrics) does NOT live here — those belong to a host-axis adapter
// (system source) that doesn't exist yet. Mixing them in would let the host
// section quietly depend on whether proxmox-ve is attached, which is the
// exact bug we just walked back. When the host adapter lands, the host TYPE
// will light up regardless of which softwares are configured.
function buildObserved(_d: any, ver: any, qemu: unknown, lxc: unknown): Record<string, unknown> {
  const observed: Record<string, unknown> = {};
  if (ver?.release) observed.pveVersion = String(ver.release);
  if (Array.isArray(qemu)) observed.vmCount = qemu.length;
  if (Array.isArray(lxc)) observed.ctCount = lxc.length;
  return observed;
}

export const proxmoxAdapter: ProbeAdapter = {
  type: "proxmox",
  async probe(config: ProbeConfig, ctx: ProbeContext): Promise<ProbeResult> {
    const auth = pveAuth();
    if (!auth) {
      return { status: "unknown", message: "proxmox not configured (set SORACK_PROXMOX_USER + SORACK_PROXMOX_TOKEN)" };
    }
    const c = config as ProxmoxProbe;
    const node = c.node || process.env.SORACK_PROXMOX_NODE;
    if (!node) {
      return { status: "unknown", message: "proxmox probe needs a node (config.node or SORACK_PROXMOX_NODE)" };
    }
    // Endpoint: explicit probe.host → node's own manual.ip → env fallback.
    const manual = ((ctx.node.meta as Record<string, unknown>)?.manual ?? {}) as Record<string, unknown>;
    const endpoint =
      c.host || (typeof manual.ip === "string" ? manual.ip : undefined) || process.env.SORACK_PROXMOX_HOST;
    if (!endpoint) {
      return { status: "unknown", message: "proxmox probe needs a host (node ip, probe.host, or SORACK_PROXMOX_HOST)" };
    }

    const start = performance.now();
    const latency = (): number => Math.round(performance.now() - start);

    try {
      // /status is required (it's the reachability check); the other three
      // are best-effort — .catch(()=>null) so one stale endpoint doesn't flip
      // the whole probe to err. Parallel so the extra calls don't pay round
      // trips in series.
      const [d, ver, qemu, lxc] = await Promise.all([
        pveGet<any>(endpoint, `/nodes/${node}/status`, auth, ctx.signal, ctx.timeoutMs),
        pveGet<any>(endpoint, `/version`, auth, ctx.signal, ctx.timeoutMs).catch(() => null),
        pveGet<any>(endpoint, `/nodes/${node}/qemu`, auth, ctx.signal, ctx.timeoutMs).catch(() => null),
        pveGet<any>(endpoint, `/nodes/${node}/lxc`, auth, ctx.signal, ctx.timeoutMs).catch(() => null),
      ]);
      // A successful /status means the PVE host is online.
      return { status: "ok" as HealthStatus, latencyMs: latency(), message: "online", observed: buildObserved(d, ver, qemu, lxc) };
    } catch (e) {
      return { status: "err", latencyMs: latency(), message: e instanceof Error ? e.message : String(e) };
    }
  },
};
