---
title: Probes & adapters
description: Built-in probe adapters, how to configure them, and how to write your own.
---

Probes are attached per node, per axis, through the UI. Each probe is backed by
an **adapter** — a small module that knows how to check one kind of thing.

## Built-in adapters

| Adapter   | Checks                                  | Credentials                |
| --------- | --------------------------------------- | -------------------------- |
| `tcp`     | TCP connect to a host/port              | none                       |
| `http`    | HTTP(S) request, status/latency         | none                       |
| `k8s`     | In-cluster Kubernetes summary           | in-cluster ServiceAccount  |
| `proxmox` | Proxmox VE node/guest status (PVE API)  | API token                  |
| `system`  | `node_exporter` scrape (`:9100/metrics`)| none                       |

All adapters **degrade gracefully** — when their environment isn't configured,
they simply return `unknown` rather than erroring.

## Configuration

### Proxmox VE

Mint a token at **PVE → Datacenter → Permissions → API Tokens**, then set:

```bash
SORACK_PROXMOX_USER=user@pam!tokenid
SORACK_PROXMOX_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SORACK_PROXMOX_INSECURE=true   # only if PVE serves a self-signed cert
```

### node_exporter (system probe)

No credentials. Install
[node_exporter](https://github.com/prometheus/node_exporter) on the host (a few
lines of systemd) and the system probe scrapes `:9100/metrics`.

### Kubernetes

Uses the in-cluster ServiceAccount — no env to set. RBAC lives in
`deploy/base/rbac.yaml` (read-only: `get`/`list` on non-secret resources).

Three shapes, chosen by what the probe config names:

```jsonc
{ "type": "k8s", "namespace": "alpha" }                         // the namespace
{ "type": "k8s", "namespace": "alpha", "service": "gateway" }    // one Service
{ "type": "k8s", "namespace": "alpha", "cronjob": "db-backup" }  // one CronJob
```

With only `namespace` — or nothing, in which case the node's name is used —
it reports the namespace: pod/deployment/statefulset readiness, service and
ingress counts, and a capped workload list. Finding nothing at all reports
`unknown`, not `ok`: an empty namespace and a healthy one are different
answers, and "the probe could not read those kinds" is a third.

`service` fills `svc_type`, `clusterIP`, `ports`, `selector` and `endpoints`
on the node, and scores on whether anything is behind it — a Service with no
ready endpoints resolves and answers nothing.

`cronjob` fills `schedule`, `suspend`, `lastScheduleTime`,
`lastSuccessfulTime` and `lastStatus`, and scores on **the outcome of the last
run only**. A failed run is a fact. Lateness is not: calling a CronJob overdue
needs a threshold against its schedule, and a guessed one invents alerts on
weekly jobs while missing hourly ones. The timestamps are reported so a person
can judge; the probe does not.

Kubernetes deletes finished Jobs past the history limit, so the last run's
outcome can be genuinely unavailable while the CronJob still carries its
timestamps. That reports `unknown` and says which — it is not the same as
never having run.

## Writing an adapter

Adding a source is deliberately small: **one file** under
`api/src/health/adapters/` and **one register call**. An adapter exports a probe
function that takes the node's probe config and returns a status plus optional
metrics; registering it makes the probe type selectable in the UI.

:::tip
Because adapters return `unknown` when unconfigured, you can ship a new adapter
and roll it out node-by-node without breaking anything that hasn't opted in.
:::
