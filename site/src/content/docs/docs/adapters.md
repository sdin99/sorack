---
title: Probes & adapters
description: Built-in probe adapters, how to configure them, and how to write your own.
---

You attach probes in the UI, one per axis on each node. Each probe uses an
**adapter**, a small module that knows how to check one kind of target.

## Built-in adapters

| Adapter   | Checks                                   | Credentials                |
| --------- | ---------------------------------------- | -------------------------- |
| `tcp`     | TCP connection to a host and port        | None                       |
| `http`    | HTTP(S) request: status and latency      | None                       |
| `k8s`     | Kubernetes resources, from in the cluster | In-cluster ServiceAccount |
| `proxmox` | Proxmox VE node and guest status         | API token                  |
| `system`  | `node_exporter` metrics (`:9100/metrics`) | None                      |

If an adapter's environment is not configured, it returns `unknown` instead of
an error.

## Configuration

### Proxmox VE

Create a dedicated user, then create an API token for it under **Datacenter →
Permissions → API Tokens** in Proxmox:

```bash
SORACK_PROXMOX_USER=sorack@pve!tokenid
SORACK_PROXMOX_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SORACK_PROXMOX_INSECURE=true   # only if PVE uses a self-signed certificate
```

:::danger[Do not use a `root@pam` token, and keep Privilege Separation on]
sorack only reads from Proxmox. Give the user the `PVEAuditor` role on `/` and
no other permissions.

A token with no ACL entries of its own is not necessarily harmless. With
Privilege Separation on (`privsep=1`, the default), such a token has no
permissions. With it off, the token has every permission of its user, and for
`root@pam` that is the whole cluster. Both cases show no ACL entries, so you
cannot tell them apart from the permission list.

Use a separate token for each sorack instance, so that a leaked development
token does not also give access to production.
:::

### node_exporter (system probe)

No credentials are needed. Install
[node_exporter](https://github.com/prometheus/node_exporter) on the host. The
system probe reads `:9100/metrics`.

### Kubernetes

The adapter uses the in-cluster ServiceAccount, so there are no environment
variables to set. RBAC is defined in `deploy/base/rbac.yaml`: read-only `get`
and `list` on resources other than Secrets.

The probe checks one of three things, depending on its configuration:

```jsonc
{ "type": "k8s", "namespace": "alpha" }                         // the namespace
{ "type": "k8s", "namespace": "alpha", "service": "gateway" }    // one Service
{ "type": "k8s", "namespace": "alpha", "cronjob": "db-backup" }  // one CronJob
```

**Namespace.** With only `namespace` set, or with nothing set (the node's name
is used), the probe reports on the namespace: readiness of pods, Deployments,
and StatefulSets; the number of Services and Ingresses; and a list of
workloads, limited in length. If it finds nothing, it reports `unknown`, not
`ok`: an empty namespace is not the same as a healthy one, and the probe may
also have been unable to read those resources.

**Service.** With `service` set, the probe fills in `svc_type`, `clusterIP`,
`ports`, `selector`, and `endpoints`, and reports `ok` when the Service has
ready endpoints.

If the Service has `ownerReferences`, that is, another resource such as an
operator created it, sorack reports `unknown` when it has no endpoints and
names the owner. The owner decides how many instances should exist. For
example, a single-instance database has no read replica, so its read-only
Service has no endpoints by design. sorack treats this the same way as a
Deployment scaled to zero, which counts as ready.

**CronJob.** With `cronjob` set, the probe fills in `schedule`, `suspend`,
`lastScheduleTime`, `lastSuccessfulTime`, and `lastStatus`, and grades only the
result of the last run. It does not report a CronJob as late. That would need a
threshold based on the schedule, and a fixed threshold would be wrong for
either weekly or hourly jobs. The timestamps are shown so you can judge.

Kubernetes deletes finished Jobs beyond the history limit (by default, three
successful and one failed), so between runs there is often no Job left to
check. sorack then uses the CronJob's own status: if `lastSuccessfulTime` is at
or after `lastScheduleTime`, the most recent run succeeded and the probe
reports `ok`.

If a run started after the last success and its Job has been deleted, sorack
cannot tell whether the run failed, is still running, or was cleaned up. The
probe reports `unknown` and says so in its message.

### Discovery

Discovery is off by default. Add `discover: true` to a namespace probe to create
a node for each Service and CronJob in the namespace:

```jsonc
{ "type": "k8s", "namespace": "apps", "discover": true }
```

Discovery creates nodes only for kinds that a probe can check on their own.
Deployments have no probe mode, so they appear in the namespace counts instead.
Services with `ownerReferences` are also skipped, for the reason described
above. They appear in the namespace report, grouped by the resource that
created them.

Each discovered node comes with a probe already configured for its object.

The id of a discovered node is its cluster coordinate, for example
`apps/cronjob/nightly-backup`, so later checks find the same node instead of
creating a new one. If one of your existing nodes already has a probe for that
object, discovery does not create another node. sorack matches nodes by probe,
not by name, because your node names may differ from the names in the cluster.

Discovery does not delete nodes. When a discovered object disappears, sorack
sets `meta.discovered.goneAt` on its node and leaves the node in place. You
remove it.

sorack cannot tell a deleted object from one it failed to read, for example
when RBAC denies access or the API server is unavailable. Deleting on absence
would remove nodes during a temporary outage.

- If the object comes back, sorack clears `goneAt`.
- If sorack cannot read a kind at all, it does not mark nodes of that kind.

## Writing an adapter

To add a source, add one file under `api/src/health/adapters/` and register it
once. An adapter exports a probe function that takes the node's probe
configuration and returns a status and, optionally, metrics. After you register
it, the probe type is available in the UI.

:::tip
Adapters return `unknown` when they are not configured, so you can release a
new adapter and enable it one node at a time.
:::
