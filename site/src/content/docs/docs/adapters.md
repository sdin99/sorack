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
`deploy/dev/rbac.yaml`.

## Writing an adapter

Adding a source is deliberately small: **one file** under
`api/src/health/adapters/` and **one register call**. An adapter exports a probe
function that takes the node's probe config and returns a status plus optional
metrics; registering it makes the probe type selectable in the UI.

:::tip
Because adapters return `unknown` when unconfigured, you can ship a new adapter
and roll it out node-by-node without breaking anything that hasn't opted in.
:::
