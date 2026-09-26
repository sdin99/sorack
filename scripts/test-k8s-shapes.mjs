// Check the CronJob/Service field mapping against objects from a real cluster.
//
// Not a unit test with fixtures I wrote: fixtures are my understanding of the
// API written twice, so they agree with the code by construction. These come
// from `kubectl get -o json` on whatever cluster is in scope, and the run says
// which objects it used.
//
// Skips (loudly, exit 0) when no cluster is reachable — it is a check you run
// against a cluster, not a gate every commit must pass.
import { execFileSync } from "node:child_process";
import { probeCronJob, probeService, tallyNamespace } from "../api/dist/health/adapters/k8s.js";

const kubectl = (args) => {
  try { return JSON.parse(execFileSync("kubectl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
  catch { return null; }
};

const cronjobs = kubectl(["get", "cronjobs", "-A", "-o", "json"]);
if (!cronjobs) {
  console.log("k8s shapes: no cluster reachable — skipped");
  process.exit(0);
}

let checked = 0;
const problems = [];

// A `g` that answers from real documents instead of the API.
const readerFor = (docs) => async (path) => {
  for (const [re, doc] of docs) if (re.test(path)) return doc;
  throw new Error(`404 no fixture for ${path}`);
};

for (const cj of (cronjobs.items ?? []).slice(0, 5)) {
  const ns = cj.metadata.namespace, name = cj.metadata.name;
  const jobs = kubectl(["get", "jobs", "-n", ns, "-o", "json"]) ?? { items: [] };
  const r = await probeCronJob(ns, name, readerFor([
    [/\/cronjobs\//, cj], [/\/jobs$/, jobs],
  ]), () => 0);
  checked++;
  console.log(`  cronjob ${ns}/${name}: ${r.status} — ${r.message}`);
  console.log(`    observed: ${JSON.stringify(r.observed)}`);

  // The mapping's job is to carry the cluster's values across unchanged.
  if (cj.spec?.schedule && r.observed.schedule !== cj.spec.schedule) {
    problems.push(`${ns}/${name}: schedule did not carry across`);
  }
  if (cj.status?.lastSuccessfulTime && r.observed.lastSuccessfulTime !== cj.status.lastSuccessfulTime) {
    problems.push(`${ns}/${name}: lastSuccessfulTime did not carry across`);
  }
  if ((cj.spec?.suspend === true) !== (r.observed.suspend === "yes")) {
    problems.push(`${ns}/${name}: suspend disagrees with spec.suspend`);
  }
}

// The branches a healthy cluster does not show. Derived from a live object
// with one field changed each time — inventing a CronJob from scratch would
// make every other field my guess too, and the guesses would agree with the
// code because I wrote both.
{
  const real = (cronjobs.items ?? [])[0];
  if (real) {
    const variant = (mutate, label, want) => ({ mutate, label, want });
    const cases = [
      variant((cj) => { delete cj.status.lastScheduleTime; delete cj.status.lastSuccessfulTime; },
        "never run", /never run yet/),
      variant((cj) => { cj.status.lastScheduleTime = "2030-01-01T00:00:00Z"; },
        "started after the last success, Job gone", /outcome unknown/),
      variant((cj) => { cj.spec.suspend = true; delete cj.status.lastSuccessfulTime; delete cj.status.lastScheduleTime; },
        "suspended", /suspended|never run yet/),
    ];
    for (const { mutate, label, want } of cases) {
      const cj = JSON.parse(JSON.stringify(real));
      mutate(cj);
      // No owned Jobs: that is the state these branches describe.
      const r = await probeCronJob(cj.metadata.namespace, cj.metadata.name,
        readerFor([[/\/cronjobs\//, cj], [/\/jobs$/, { items: [] }]]), () => 0);
      checked++;
      const ok = want.test(r.message);
      console.log(`  ${ok ? " " : "✗"} variant "${label}": ${r.status} — ${r.message}`);
      if (!ok) problems.push(`variant "${label}" said "${r.message}"`);
    }
  }
}

// ── namespace tally against live namespaces ───────────────────────────────
// The bug this guards: a Job's failed first attempt counted as a not-ready
// pod, so one retry turned a whole namespace yellow until Kubernetes
// collected the pod — and the finished Job pods counted as *ready*, so the
// "46/47 pods ready" said nothing about what was serving.
{
  const nsList = kubectl(["get", "namespaces", "-o", "json"]) ?? { items: [] };
  const names = (nsList.items ?? []).map((n) => n.metadata.name);
  // Prefer a namespace that actually runs scheduled work — that is where the
  // two kinds of pod coexist and the mistake shows.
  const scored = names.map((ns) => {
    const pods = kubectl(["get", "pods", "-n", ns, "-o", "json"]) ?? { items: [] };
    const jobPods = (pods.items ?? []).filter((p) =>
      (p.metadata.ownerReferences ?? []).some((o) => o.kind === "Job")).length;
    return { ns, pods, jobPods };
  }).sort((a, b) => b.jobPods - a.jobPods).slice(0, 3);

  for (const { ns, pods, jobPods } of scored) {
    const deps = kubectl(["get", "deployments", "-n", ns, "-o", "json"]) ?? { items: [] };
    const sts = kubectl(["get", "statefulsets", "-n", ns, "-o", "json"]) ?? { items: [] };
    const jobs = kubectl(["get", "jobs", "-n", ns, "-o", "json"]) ?? { items: [] };
    const t = tallyNamespace(pods.items ?? [], deps.items ?? [], sts.items ?? [], jobs.items ?? []);
    checked++;
    console.log(`  namespace ${ns}: ${t.podReadyN}/${t.servicePods.length} service pods ready` +
      ` (${t.jobPods} job pods excluded) · jobs ${JSON.stringify(t.jobs)} · notReady=${t.notReady}`);

    // No pod that a Job created may be inside the service tally.
    if (t.servicePods.some((p) => (p.metadata.ownerReferences ?? []).some((o) => o.kind === "Job"))) {
      problems.push(`${ns}: a Job pod leaked into the service pod tally`);
    }
    // A Job that Kubernetes has not given up on must not count as not-ready,
    // however many attempts it took.
    const retried = (jobs.items ?? []).filter((j) =>
      (j.status?.failed ?? 0) > 0 && (j.status?.succeeded ?? 0) > 0);
    if (retried.length > 0 && t.jobs.failed > 0) {
      const reallyFailed = (jobs.items ?? []).filter((j) =>
        (j.status?.conditions ?? []).some((c) => c.type === "Failed" && c.status === "True"));
      if (reallyFailed.length !== t.jobs.failed) {
        problems.push(`${ns}: counted ${t.jobs.failed} failed jobs, ${reallyFailed.length} have a Failed condition`);
      }
    }
    if (jobPods > 0 && t.podReadyN > t.servicePods.length) {
      problems.push(`${ns}: more ready pods than service pods`);
    }
  }
}

const services = kubectl(["get", "services", "-A", "-o", "json"]) ?? { items: [] };
for (const svc of (services.items ?? []).filter((s) => s.spec?.type !== "ExternalName").slice(0, 5)) {
  const ns = svc.metadata.namespace, name = svc.metadata.name;
  const ep = kubectl(["get", "endpoints", name, "-n", ns, "-o", "json"]) ?? { subsets: [] };
  const r = await probeService(ns, name, readerFor([
    [/\/services\//, svc], [/\/endpoints\//, ep],
  ]), () => 0);
  checked++;
  console.log(`  service ${ns}/${name}: ${r.status} — ${r.message}`);
  console.log(`    observed: ${JSON.stringify(r.observed)}`);

  if (svc.spec?.clusterIP && r.observed.clusterIP !== svc.spec.clusterIP) {
    problems.push(`${ns}/${name}: clusterIP did not carry across`);
  }
  if (svc.spec?.type && r.observed.svc_type !== svc.spec.type) {
    problems.push(`${ns}/${name}: svc_type did not carry across`);
  }
  const want = (ep.subsets ?? []).reduce((n, s) => n + (s.addresses?.length ?? 0), 0);
  if (r.observed.endpoints !== String(want)) {
    problems.push(`${ns}/${name}: endpoints ${r.observed.endpoints} != ${want}`);
  }
}

if (checked === 0) {
  console.error("k8s shapes: found no cronjobs or services to check — that is not a pass");
  process.exit(2);
}
if (problems.length) {
  console.error(`\nk8s shapes: ${problems.length} problem(s) of ${checked} object(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\nk8s shapes: ${checked} live object(s) map correctly`);
