// Kubernetes probe — namespace-level health + workload tallies.
//
// Unlike http/tcp (a single reachability check), this queries the in-cluster
// API for a namespace and returns rich `observed.k8s` data (pod/deploy/sts
// ready counts, service/ingress counts, a capped workload list) that the
// detail panel's countGrid / workloadList widgets render. Namespace status is
// derived from readiness: anything not ready → warn.
//
// Zero-dep on purpose (matches the project's net.Socket/scrypt choices): a
// small https client reads the projected ServiceAccount token + CA from the
// standard in-cluster paths. Needs the read-only RBAC in deploy/dev/rbac.yaml.

import https from "node:https";
import { readFileSync } from "node:fs";
import type { HealthStatus, ProbeAdapter, ProbeConfig, ProbeContext, ProbeResult } from "../types";

const SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";

// Read fresh each call: the projected token rotates on disk. Cheap (small
// files), and returns null when not running in-cluster so the adapter can
// degrade to "unknown" instead of throwing.
function inClusterConfig(): { host: string; port: string; token: string; ca: Buffer } | null {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  if (!host) return null;
  const port = process.env.KUBERNETES_SERVICE_PORT || "443";
  try {
    const token = readFileSync(`${SA_DIR}/token`, "utf8").trim();
    const ca = readFileSync(`${SA_DIR}/ca.crt`);
    return { host, port, token, ca };
  } catch {
    return null;
  }
}

function k8sGet<T = any>(path: string, signal: AbortSignal, timeoutMs: number): Promise<T> {
  const cfg = inClusterConfig();
  if (!cfg) return Promise.reject(new Error("not running in-cluster (no service account)"));
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: cfg.host,
        port: cfg.port,
        path,
        method: "GET",
        ca: cfg.ca,
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
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
            reject(new Error(`k8s ${code} on ${path}: ${body.slice(0, 160)}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`k8s timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

// A pod is "ready" when running with all containers ready (or completed).
function podReady(p: any): boolean {
  const phase = p?.status?.phase;
  if (phase === "Succeeded") return true;
  if (phase !== "Running") return false;
  const cs = p?.status?.containerStatuses ?? [];
  return cs.length > 0 && cs.every((c: any) => c.ready);
}
function podStatus(p: any): HealthStatus {
  const phase = p?.status?.phase;
  if (phase === "Succeeded") return "ok";
  if (phase === "Failed" || phase === "Unknown") return "err";
  return podReady(p) ? "ok" : "warn";
}
// A controller (Deployment/StatefulSet) is ready when ready replicas meet the
// desired count. Scaled-to-zero (0/0) counts as ready.
function ctrlReady(o: any): boolean {
  const want = o?.spec?.replicas ?? 0;
  const got = o?.status?.readyReplicas ?? 0;
  return got >= want;
}

const WORKLOAD_CAP = 12;

export const k8sAdapter: ProbeAdapter = {
  type: "k8s",
  async probe(config: ProbeConfig, ctx: ProbeContext): Promise<ProbeResult> {
    // Namespace from explicit config, else the node's name (k8s_namespace
    // nodes are named after the namespace).
    const ns = (config as any).namespace || ctx.node.name;
    if (!ns || typeof ns !== "string") {
      return { status: "unknown", message: "k8s probe needs a namespace (config.namespace or node name)" };
    }
    const start = performance.now();
    const g = <T,>(path: string): Promise<T> => k8sGet<T>(path, ctx.signal, ctx.timeoutMs);
    const latency = (): number => Math.round(performance.now() - start);

    try {
      const [pods, deploys, sts, svcs, ings] = await Promise.all([
        g<any>(`/api/v1/namespaces/${ns}/pods`),
        g<any>(`/apis/apps/v1/namespaces/${ns}/deployments`),
        g<any>(`/apis/apps/v1/namespaces/${ns}/statefulsets`),
        g<any>(`/api/v1/namespaces/${ns}/services`),
        g<any>(`/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`),
      ]);

      const podItems: any[] = pods.items ?? [];
      const depItems: any[] = deploys.items ?? [];
      const stsItems: any[] = sts.items ?? [];
      const podReadyN = podItems.filter(podReady).length;
      const depReadyN = depItems.filter(ctrlReady).length;
      const stsReadyN = stsItems.filter(ctrlReady).length;

      // not-ready pods first, then cap (countGrid still shows the true total).
      const workloads = [...podItems]
        .sort((a, b) => (podReady(a) ? 1 : 0) - (podReady(b) ? 1 : 0))
        .slice(0, WORKLOAD_CAP)
        .map((p) => ({ name: p?.metadata?.name ?? "?", kind: "Pod", status: podStatus(p) }));

      const notReady =
        podItems.length - podReadyN + (depItems.length - depReadyN) + (stsItems.length - stsReadyN);
      const status: HealthStatus = notReady > 0 ? "warn" : "ok";

      const k8s = {
        pods: { ready: podReadyN, total: podItems.length },
        deployments: { ready: depReadyN, total: depItems.length },
        statefulsets: { ready: stsReadyN, total: stsItems.length },
        services: { count: (svcs.items ?? []).length },
        ingresses: { count: (ings.items ?? []).length },
        workloads,
      };

      return {
        status,
        latencyMs: latency(),
        message: `${podReadyN}/${podItems.length} pods ready`,
        observed: { k8s },
      };
    } catch (e) {
      return { status: "err", latencyMs: latency(), message: e instanceof Error ? e.message : String(e) };
    }
  },
};
