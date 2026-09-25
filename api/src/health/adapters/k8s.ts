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
import type { HealthStatus, ProbeAdapter, ProbeConfig, ProbeContext, ProbeResult } from "../types.js";

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

// Ports as a person reads them, not as the API returns them. A detail row is
// a label and a value; handing it an array of objects puts "[object Object]"
// on the screen.
function portsText(ports: any[]): string | undefined {
  if (!Array.isArray(ports) || ports.length === 0) return undefined;
  return ports
    .map((p) => `${p?.port ?? "?"}${p?.nodePort ? `:${p.nodePort}` : ""}/${p?.protocol ?? "TCP"}`)
    .join(", ");
}

function selectorText(sel: Record<string, string> | undefined): string | undefined {
  if (!sel || Object.keys(sel).length === 0) return undefined;
  return Object.entries(sel).map(([k, v]) => `${k}=${v}`).join(", ");
}

// ── one CronJob ────────────────────────────────────────────────────────────
//
// Exported for scripts/test-k8s-shapes.mjs, which feeds it objects pulled
// from a live cluster with kubectl. The mistakes in a mapping like this are
// field paths — `status.lastSuccessfulTime` against the real document, not
// against what I remember the API returning.
//
// The namespace probe already reads these facts, but it writes them into
// observed.k8s.cronjobs.items[] for the namespace's widgets. A node that IS a
// CronJob needs them as its own fields, and the detail renderer reads
// meta.observed[key] flat — so a nested blob never reaches it.
//
// ‼ Scored on the outcome of the last run, and only that. A failed run is a
// fact. Lateness is not: deciding a CronJob is overdue needs a threshold
// against its schedule, and a guessed one invents alerts on weekly jobs while
// missing hourly ones. `lastScheduleTime` is reported so a person can judge;
// the probe does not.
export async function probeCronJob(
  ns: string, name: string,
  g: <T>(p: string) => Promise<T>,
  latency: () => number,
): Promise<ProbeResult> {
  const cj = await g<any>(`/apis/batch/v1/namespaces/${ns}/cronjobs/${name}`);
  const suspended = cj?.spec?.suspend === true;
  const uid = cj?.metadata?.uid;

  // Jobs it owns, newest first. ownerReferences is the only reliable link —
  // the generated names are `<cronjob>-<timestamp>` but nothing guarantees it.
  let lastStatus: string | undefined;
  let lastJobFailed = false;
  let lastJobSucceeded = false;
  try {
    const jobs = await g<any>(`/apis/batch/v1/namespaces/${ns}/jobs`);
    const mine = (jobs?.items ?? [])
      .filter((j: any) => (j?.metadata?.ownerReferences ?? []).some((o: any) => o?.uid === uid))
      .sort((a: any, b: any) =>
        String(b?.metadata?.creationTimestamp ?? "").localeCompare(String(a?.metadata?.creationTimestamp ?? "")));
    const last = mine[0];
    if (last) {
      lastJobFailed = (last?.status?.failed ?? 0) > 0;
      lastJobSucceeded = (last?.status?.succeeded ?? 0) > 0;
      lastStatus = lastJobFailed ? "failed" : lastJobSucceeded ? "succeeded" : "running";
    }
  } catch {
    // Jobs unreadable (RBAC, or they have been garbage-collected). The
    // CronJob's own fields still stand; only the outcome is unknown, and
    // saying nothing about it beats inferring success from silence.
  }

  const observed: Record<string, unknown> = {
    schedule: cj?.spec?.schedule ?? undefined,
    suspend: suspended ? "yes" : "no",
    lastScheduleTime: cj?.status?.lastScheduleTime ?? undefined,
    lastSuccessfulTime: cj?.status?.lastSuccessfulTime ?? undefined,
    lastStatus,
  };

  let status: HealthStatus;
  let message: string;
  if (lastJobFailed) {
    status = "err";
    message = `last run failed (${cj?.status?.lastScheduleTime ?? "unknown time"})`;
  } else if (lastJobSucceeded) {
    status = "ok";
    message = `last run succeeded${cj?.status?.lastSuccessfulTime ? ` (${cj.status.lastSuccessfulTime})` : ""}`;
  } else if (suspended) {
    status = "unknown";
    message = "suspended — the schedule is paused, so there is nothing to judge";
  } else {
    // No Job we can read, so the last run's outcome is unavailable. That is
    // not the same as never having run, and the CronJob's own status says
    // which: Kubernetes deletes finished Jobs past the history limit while
    // keeping these timestamps.
    //
    // ‼ Found by running this against the live cluster: alpha/db-backup
    // reported "never run yet" while carrying lastSuccessfulTime from forty
    // minutes earlier. The message contradicted the field printed beside it.
    status = "unknown";
    const last = cj?.status?.lastSuccessfulTime ?? cj?.status?.lastScheduleTime;
    message = last
      ? `last run's Job is no longer retained — most recent activity ${last}`
      : "never run yet";
  }
  return { status, latencyMs: latency(), message, observed };
}

// ── one Service ────────────────────────────────────────────────────────────
//
// Same gap as CronJob: k8s_service has declared clusterIP / ports / selector /
// endpoints since it was written and nothing has ever filled them, because the
// only k8s probe was namespace-shaped.
//
// Scored on whether anything is behind it. A Service with no ready endpoints
// resolves and answers nothing — which is a fact about now, not a threshold.
export async function probeService(
  ns: string, name: string,
  g: <T>(p: string) => Promise<T>,
  latency: () => number,
): Promise<ProbeResult> {
  const svc = await g<any>(`/api/v1/namespaces/${ns}/services/${name}`);
  let ready = 0;
  let endpointsKnown = false;
  try {
    const ep = await g<any>(`/api/v1/namespaces/${ns}/endpoints/${name}`);
    ready = (ep?.subsets ?? []).reduce((n: number, s: any) => n + (s?.addresses?.length ?? 0), 0);
    endpointsKnown = true;
  } catch {
    // Endpoints unreadable — report the Service's own fields and leave the
    // backing count out rather than printing a zero we did not observe.
  }

  const observed: Record<string, unknown> = {
    svc_type: svc?.spec?.type ?? undefined,
    clusterIP: svc?.spec?.clusterIP ?? undefined,
    ports: portsText(svc?.spec?.ports),
    selector: selectorText(svc?.spec?.selector),
    endpoints: endpointsKnown ? String(ready) : undefined,
  };

  if (!endpointsKnown) {
    return { status: "unknown", latencyMs: latency(), message: "service found; endpoints not readable", observed };
  }
  if (svc?.spec?.type === "ExternalName") {
    return { status: "ok", latencyMs: latency(), message: `ExternalName → ${svc?.spec?.externalName}`, observed };
  }
  return ready > 0
    ? { status: "ok", latencyMs: latency(), message: `${ready} endpoint(s)`, observed }
    : { status: "warn", latencyMs: latency(), message: "no ready endpoints — nothing is behind this service", observed };
}

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

    // Three shapes, chosen by what the config names. `namespace` alone keeps
    // the original behaviour, so nothing that exists today changes.
    const cronjob = (config as any).cronjob;
    const service = (config as any).service;
    if (cronjob || service) {
      const name = String(cronjob || service);
      try {
        return cronjob
          ? await probeCronJob(ns, name, g, latency)
          : await probeService(ns, name, g, latency);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // A 404 is a statement about the cluster, not a broken probe: the
        // thing this node stands for is not there.
        return { status: /404/.test(msg) ? "err" : "unknown", latencyMs: latency(), message: msg };
      }
    }

    try {
      const [pods, deploys, sts, svcs, ings] = await Promise.all([
        g<any>(`/api/v1/namespaces/${ns}/pods`),
        g<any>(`/apis/apps/v1/namespaces/${ns}/deployments`),
        g<any>(`/apis/apps/v1/namespaces/${ns}/statefulsets`),
        g<any>(`/api/v1/namespaces/${ns}/services`),
        g<any>(`/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`),
      ]);

      // CronJobs are fetched separately and tolerantly, for two reasons.
      //
      // They were invisible before: between runs a CronJob has no pod, so a
      // survey of running workloads reports a namespace of nothing but
      // CronJobs as empty — and empty scored as healthy. Backups, renovate,
      // certificate renewal and media sync all live here, which is most of
      // what a homelab actually runs on a schedule.
      //
      // Tolerantly, because an existing install's ClusterRole does not grant
      // batch. Putting this in the Promise.all above would turn one 403 into
      // a failed probe for every namespace — the monitor going red about
      // itself, on clusters where nothing is wrong. A permission we do not
      // have has to read as "not observed", never as zero and never as an
      // outage.
      const batch = await Promise.allSettled([
        g<any>(`/apis/batch/v1/namespaces/${ns}/cronjobs`),
        g<any>(`/apis/batch/v1/namespaces/${ns}/jobs`),
      ]);
      const batchOf = (i: number): { items: any[] } | { denied: string } => {
        const r = batch[i];
        if (r.status === "fulfilled") return { items: r.value?.items ?? [] };
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        return { denied: msg };
      };
      const cronRes = batchOf(0);
      const jobRes = batchOf(1);
      const cronItems: any[] = "items" in cronRes ? cronRes.items : [];
      const jobItems: any[] = "items" in jobRes ? jobRes.items : [];
      const batchDenied = "denied" in cronRes || "denied" in jobRes;

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

      // Anything at all to judge? Previously `notReady === 0` meant "ok",
      // which made an empty namespace and a fully healthy one report the
      // same thing — and "empty" included every namespace whose workloads
      // this adapter could not enumerate. Finding nothing is not a clean
      // bill of health; it is the absence of an observation, and it has to
      // say so.
      const observedCount =
        podItems.length + depItems.length + stsItems.length + cronItems.length + jobItems.length;

      let status: HealthStatus;
      let message: string;
      if (observedCount === 0) {
        status = "unknown";
        message = batchDenied
          ? `nothing observed in ${ns} (and batch/v1 was denied — the ClusterRole may need cronjobs/jobs)`
          : `nothing observed in ${ns} — the namespace is empty, or holds only kinds this probe does not read`;
      } else {
        status = notReady > 0 ? "warn" : "ok";
        message = `${podReadyN}/${podItems.length} pods ready`;
        if (cronItems.length > 0) message += `, ${cronItems.length} cronjob(s)`;
        if (batchDenied) message += " (cronjobs not readable)";
      }

      const k8s = {
        pods: { ready: podReadyN, total: podItems.length },
        deployments: { ready: depReadyN, total: depItems.length },
        statefulsets: { ready: stsReadyN, total: stsItems.length },
        services: { count: (svcs.items ?? []).length },
        ingresses: { count: (ings.items ?? []).length },
        // Deliberately not scored yet. Deciding a CronJob is late needs its
        // schedule, and guessing a threshold here would invent alerts on
        // weekly jobs while missing hourly ones. The facts are surfaced so
        // the freshness work can use them; see docs/STATUS.md.
        cronjobs: "denied" in cronRes
          ? { observed: false, reason: "forbidden" }
          : {
              observed: true,
              total: cronItems.length,
              suspended: cronItems.filter((cj) => cj?.spec?.suspend === true).length,
              items: cronItems.slice(0, WORKLOAD_CAP).map((cj) => ({
                name: cj?.metadata?.name ?? "?",
                schedule: cj?.spec?.schedule ?? null,
                suspended: cj?.spec?.suspend === true,
                lastScheduleTime: cj?.status?.lastScheduleTime ?? null,
                lastSuccessfulTime: cj?.status?.lastSuccessfulTime ?? null,
              })),
            },
        jobs: "denied" in jobRes
          ? { observed: false, reason: "forbidden" }
          : { observed: true, total: jobItems.length },
        workloads,
      };

      return { status, latencyMs: latency(), message, observed: { k8s } };
    } catch (e) {
      return { status: "err", latencyMs: latency(), message: e instanceof Error ? e.message : String(e) };
    }
  },
};
