// System probe — host-axis identity + metrics, fetched from a node_exporter
// HTTP /metrics endpoint. First transport for the "system" source; an
// sorack-shaped agent will follow as a second transport later, configurable
// per-probe (config.transport).
//
// Why this and not SSH: read-only pull, no remote command execution, the
// exporter is unprivileged by design. Standard Prometheus pattern.
//
// What we extract (one scrape):
//   - os       ← node_os_info{pretty_name=…} (fallback: node_uname_info sysname)
//   - kernel   ← node_uname_info{release=…}
//   - uptime   ← node_time_seconds − node_boot_time_seconds  (humanized)
//   - metrics.cpu  ← rate over node_cpu_seconds_total{mode!="idle"} —
//                    REQUIRES previous-sample state, supplied by the
//                    collector via ctx (we just emit raw totals; collector
//                    diffs them). First tick: no cpu reading.
//   - metrics.mem  ← MemTotal − MemAvailable / MemTotal
//   - metrics.disk ← filesystem size − avail at mountpoint="/"
//
// Endpoint resolution mirrors tcp/proxmox: explicit config.host wins, else
// node.meta.manual.ip, else nothing (probe goes unknown). Port defaults to
// node_exporter's well-known 9100.
//
// Zero runtime deps. Prometheus exposition format is plain text; we parse
// just the metrics we need with one regex per line.

import http from "node:http";
import type { HealthStatus, ProbeAdapter, ProbeConfig, ProbeContext, ProbeResult } from "../types";

interface SystemProbe extends ProbeConfig {
  host?: string;
  port?: number;
  // Reserved for future multi-transport: 'node_exporter' (default) | 'sorack_agent' | …
  transport?: string;
}

const DEFAULT_PORT = 9100;

// GET text/plain from `/metrics`. Returns the response body or throws.
function getMetrics(host: string, port: number, signal: AbortSignal, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path: "/metrics", method: "GET", signal, timeout: timeoutMs, headers: { Accept: "text/plain" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const code = res.statusCode ?? 0;
          if (code < 200 || code >= 300) {
            reject(new Error(`node_exporter ${code}: ${body.slice(0, 160)}`));
            return;
          }
          resolve(body);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`node_exporter timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

// Parse a Prometheus exposition line "<metric>{<labels>} <value> [ts]".
// Comments (#) skipped by caller; we only emit (metric, labels, value).
const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/;
const LABEL_RE = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

function parseLabels(s: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  let m: RegExpExecArray | null;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(s))) out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
  return out;
}

// Streaming visitor — we only need a handful of metrics, so we scan once and
// hand each matching line to a handler.
function forEachSample(body: string, fn: (metric: string, labels: Record<string, string>, value: number) => void): void {
  for (const raw of body.split("\n")) {
    if (!raw || raw[0] === "#") continue;
    const m = raw.match(LINE_RE);
    if (!m) continue;
    const val = Number(m[4]);
    if (!Number.isFinite(val)) continue;
    fn(m[1], parseLabels(m[3]), val);
  }
}

function gibFromBytes(bytes: number): number {
  return Math.round((bytes / 2 ** 30) * 10) / 10;
}

function humanizeUptime(sec: number): string | undefined {
  if (!Number.isFinite(sec) || sec <= 0) return undefined;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Walk the scrape once, collecting just the values we map to observed.*.
// node_cpu_seconds_total is many lines (per-cpu × per-mode); we sum mode
// totals across all CPUs into idleSec / busySec — the collector diffs these
// against the previous tick to get the pct.
interface Parsed {
  os?: string;
  kernel?: string;
  bootTime?: number;
  nowTime?: number;
  memTotal?: number;
  memAvail?: number;
  fsSizeRoot?: number;
  fsAvailRoot?: number;
  cpuIdleSec: number;
  cpuTotalSec: number;
}

function parseScrape(body: string): Parsed {
  const p: Parsed = { cpuIdleSec: 0, cpuTotalSec: 0 };
  forEachSample(body, (metric, labels, value) => {
    switch (metric) {
      case "node_os_info":
        if (labels.pretty_name) p.os = labels.pretty_name;
        return;
      case "node_uname_info":
        if (!p.os && labels.sysname) p.os = labels.sysname;
        if (labels.release) p.kernel = labels.release;
        return;
      case "node_time_seconds":
        p.nowTime = value;
        return;
      case "node_boot_time_seconds":
        p.bootTime = value;
        return;
      case "node_memory_MemTotal_bytes":
        p.memTotal = value;
        return;
      case "node_memory_MemAvailable_bytes":
        p.memAvail = value;
        return;
      case "node_filesystem_size_bytes":
        if (labels.mountpoint === "/") p.fsSizeRoot = value;
        return;
      case "node_filesystem_avail_bytes":
        if (labels.mountpoint === "/") p.fsAvailRoot = value;
        return;
      case "node_cpu_seconds_total":
        p.cpuTotalSec += value;
        if (labels.mode === "idle") p.cpuIdleSec += value;
        return;
    }
  });
  return p;
}

// Build observed.* — CPU pct comes from the collector via ctx (it remembers
// the previous scrape's idle/total totals per node and diffs them). On the
// first tick for a node we just don't emit metrics.cpu.
export function buildObserved(p: Parsed, prev?: { idleSec: number; totalSec: number }): Record<string, unknown> {
  const observed: Record<string, unknown> = {};
  if (p.os) observed.os = p.os;
  if (p.kernel) observed.kernel = p.kernel;
  if (p.nowTime && p.bootTime && p.nowTime > p.bootTime) {
    const up = humanizeUptime(p.nowTime - p.bootTime);
    if (up) observed.uptime = up;
  }

  const metrics: Record<string, unknown> = {};
  if (p.memTotal && p.memTotal > 0) {
    const total = gibFromBytes(p.memTotal);
    const avail = p.memAvail ?? 0;
    const used = gibFromBytes(p.memTotal - avail);
    metrics.mem = { used, total, unit: "GB" };
  }
  if (p.fsSizeRoot && p.fsSizeRoot > 0) {
    const total = gibFromBytes(p.fsSizeRoot);
    const avail = p.fsAvailRoot ?? 0;
    const used = gibFromBytes(p.fsSizeRoot - avail);
    metrics.disk = { used, total, unit: "GB" };
  }
  if (prev && p.cpuTotalSec > prev.totalSec) {
    const dTotal = p.cpuTotalSec - prev.totalSec;
    const dIdle = p.cpuIdleSec - prev.idleSec;
    const pct = Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100));
    metrics.cpu = { pct: Math.round(pct * 10) / 10 };
  }
  if (Object.keys(metrics).length > 0) observed.metrics = metrics;

  return observed;
}

// Per-node CPU sample memory. The collector owns this Map and passes the
// previous entry in via ctx (we extend ProbeContext-by-convention with a
// generic adapter-state bag); we return the new totals so the collector can
// store them for the next tick. Keyed by node id.
const cpuPrev = new Map<string, { idleSec: number; totalSec: number }>();

export const systemAdapter: ProbeAdapter = {
  type: "system",
  async probe(config: ProbeConfig, ctx: ProbeContext): Promise<ProbeResult> {
    const c = config as SystemProbe;
    const manual = ((ctx.node.meta as Record<string, unknown>)?.manual ?? {}) as Record<string, unknown>;
    const host =
      (typeof c.host === "string" && c.host.trim()) ||
      (typeof manual.ip === "string" ? manual.ip : "") ||
      "";
    if (!host) {
      return { status: "unknown", message: "system probe needs host (config.host or manual.ip)" };
    }
    const port = typeof c.port === "number" ? c.port : DEFAULT_PORT;

    const start = performance.now();
    const latency = (): number => Math.round(performance.now() - start);

    try {
      const body = await getMetrics(host, port, ctx.signal, ctx.timeoutMs);
      const parsed = parseScrape(body);
      const prev = cpuPrev.get(ctx.node.id);
      const observed = buildObserved(parsed, prev);
      cpuPrev.set(ctx.node.id, { idleSec: parsed.cpuIdleSec, totalSec: parsed.cpuTotalSec });
      return { status: "ok" as HealthStatus, latencyMs: latency(), message: "scraped", observed };
    } catch (e) {
      return { status: "err", latencyMs: latency(), message: e instanceof Error ? e.message : String(e) };
    }
  },
};
