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
import { probeCronJob, probeService } from "../api/dist/health/adapters/k8s.js";

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
