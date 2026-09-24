# sorack

A self-hosted **homelab control plane**. Edit your infrastructure as a live
topology graph, monitor it per-axis (infra + per-software probes), and keep
node-linked runbooks alongside it — in one open-source dashboard.

**[sorack.com](https://sorack.com)** · **[Documentation](https://sorack.com/docs)** · MIT licensed

> **Status:** early release. The data model and UI are stable enough to use;
> expect rough edges around onboarding, packaging and adapter breadth.

## Features

- **Inventory + topology** — create, rename, reparent and connect nodes with
  typed edges directly on the graph. Layout is auto-managed (dagre), so cosmetic
  edits don't reshuffle the picture.
- **Two-axis node model** — every node has an _infra_ type (host, vm, container,
  k8s_namespace, router, …) and zero or more _software_ attachments (Proxmox VE,
  PostgreSQL, Jellyfin, …). Detail fields and monitoring slots merge from both.
- **Per-axis monitoring** — one probe per axis. Run an infra reachability check
  and a software API check at the same time; the StatusLine picks a primary
  aspect and offers a pill row to switch.
- **Built-in adapters** — `tcp`, `http`, `k8s` (in-cluster), `proxmox` (PVE API),
  `system` (node_exporter). Adding a source is one file plus one register call.
- **Runbooks** — markdown runbooks linked to nodes, with an in-app editor,
  `[[node:…]]` links, git sync and attachments.
- **EN / KO** throughout.

## Architecture

- `web/` — Vite + React + TS. React Flow + dagre for the topology canvas.
- `api/` — Hono + drizzle on Postgres. Schemas: `inventory` (nodes/edges),
  `docs` (runbooks), `monitoring` (alerts), `auth` (users/sessions).
- `deploy/` — Kubernetes manifests.
- `site/` — this project's website + docs ([sorack.com](https://sorack.com), Astro + Starlight).

## Quickstart

```bash
git clone https://github.com/sdin99/sorack
kubectl apply -f sorack/deploy/dev/namespace.yaml

# create the sorack-db / sorack-app Secrets (see the docs), then:
kubectl apply -f sorack/deploy/postgres/
kubectl apply -f sorack/deploy/dev/

kubectl -n sorack port-forward svc/sorack 5173:80
# open http://localhost:5173
```

Migrations run automatically on api boot. The full self-hosting guide —
Secrets, adapters, environment reference and troubleshooting — is at
**[sorack.com/docs](https://sorack.com/docs)**.

## Container image

```
ghcr.io/sdin99/sorack:0.1.1
ghcr.io/sdin99/sorack@sha256:...        # what a deployment should pin
```

Only immutable references are published: an exact version and a `sha-<commit>`
tag. There is deliberately no `latest` — pinning a mutable tag means a restart
can silently change what you are running.

> A `latest` tag exists from the first release and points at `0.1.1` forever.
> It will not be updated. Do not use it.

## License

[MIT](./LICENSE)
