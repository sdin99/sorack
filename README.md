# Sorack

A homelab control-plane dashboard. Topology editor, per-node detail panels,
multi-aspect monitoring (infra + per-software probes), and a small adapter
layer that pulls live data from sources like the Kubernetes API, Proxmox VE,
and Prometheus node_exporter.

> **Status:** early release. The shape of the data model and the UI are
> stable enough to use; expect rough edges around onboarding, packaging,
> and breadth of adapter coverage.

## Features

- **Inventory + topology** — edit nodes inline on the graph (create, rename,
  reparent, connect with typed edges). Layout is auto-managed (dagre) so
  cosmetic edits don't shuffle the picture.
- **Two-axis node model** — every node has an _infra_ type (host, vm,
  container, k8s_namespace, router, …) and zero or more _software_
  attachments (Proxmox VE, PostgreSQL, Jellyfin, …). Detail fields and
  monitoring slots merge from both axes.
- **Per-aspect monitoring** — one probe per axis. Run, for example, a
  reachability probe on the infra side and a Proxmox API probe on the
  software side at the same time; the StatusLine picks a primary aspect and
  exposes a pill row to switch between them.
- **Built-in adapters** — tcp, http, k8s (in-cluster summary), proxmox (PVE
  API), system (node_exporter scrape). Adding a source is one file under
  `api/src/health/adapters/` and one register call.
- **Runbooks** — markdown runbooks linked to nodes; rendered inside the app.
- **EN / KO** UI strings.

## Architecture

- `web/` — Vite + React + TS. React Flow + dagre for the topology canvas.
- `api/` — Hono + drizzle on top of Postgres. Three schemas:
  `inventory` (nodes/edges), `docs` (runbooks), `monitoring` (alerts),
  plus `auth` for users/sessions.
- `deploy/` — example Kubernetes manifests for a dev deployment.

## Self-hosting (Kubernetes, dev pod)

The dev manifests run the app as a single pod that mounts a checked-out copy
of this repo and runs `pnpm dev` (Vite + tsx watch) inside.

### Prerequisites

- A Kubernetes cluster with a default StorageClass.
- A clone of this repo on the cluster node that will host the dev pod (the
  pod uses `hostPath`).
- Optional: ingress controller + cert-manager if you want HTTPS via an
  Ingress; otherwise port-forward works fine.

### 1. Create the Secrets

Two Secrets — concerns kept separate so DB and app config can rotate
independently:

| Secret      | Source                                  | Consumed by                 |
| ----------- | --------------------------------------- | --------------------------- |
| `sorack-db` | `deploy/postgres/secret.example.yaml`   | postgres statefulset + api  |
| `sorack-app`| `deploy/secret.example.yaml`            | api only                    |

```bash
kubectl apply -f deploy/dev/namespace.yaml

# Copy + fill in real values (don't commit the filled-in copies)
cp deploy/postgres/secret.example.yaml /tmp/sorack-db.yaml
cp deploy/secret.example.yaml          /tmp/sorack-app.yaml
$EDITOR /tmp/sorack-db.yaml /tmp/sorack-app.yaml
# sorack-db : POSTGRES_USERNAME / POSTGRES_PASSWORD
# sorack-app: SORACK_AUTH_SECRET (openssl rand -base64 48), optional admin/proxmox/cors

kubectl apply -f /tmp/sorack-db.yaml
kubectl apply -f /tmp/sorack-app.yaml
```

Use sealed-secrets / external-secrets / Infisical instead of plain Secrets
if you prefer — the pod just expects Secrets of those names in that
namespace.

### 2. Edit the deployment for your host

`deploy/dev/deployment.yaml` mounts a hostPath. Change the path near the
bottom to wherever you cloned the repo on the cluster node:

```yaml
volumes:
  - name: src
    hostPath:
      path: /home/youruser/projects/sorack
      type: Directory
```

### 3. Apply the rest

```bash
kubectl apply -f deploy/postgres/
kubectl apply -f deploy/dev/
```

The api pod logs the generated admin password on first boot if you didn't
set `SORACK_ADMIN_PASSWORD` in the Secret:

```bash
kubectl logs -n sorack deploy/sorack -c dev | grep -i password
```

### 4. Reach the UI

Easiest:

```bash
kubectl port-forward -n sorack svc/sorack 5173:80
# then open http://localhost:5173
```

Or copy `deploy/dev/ingress.example.yaml` to `ingress.yaml`, set your
hostname + TLS, and apply.

### 5. Seed (optional, demo data)

```bash
kubectl exec -n sorack deploy/sorack -c dev -- \
  sh -c 'cd /workspace/api && pnpm tsx src/seed/seed.ts'
```

## Adapter configuration

Probes are attached per node through the UI. Optional adapters need
environment variables (add them to the Secret above):

- **Proxmox VE** — `SORACK_PROXMOX_USER` (`user@realm!tokenid`) +
  `SORACK_PROXMOX_TOKEN` (the token secret). Mint at PVE → Datacenter →
  Permissions → API Tokens. Set `SORACK_PROXMOX_INSECURE=true` if PVE
  serves a self-signed cert.
- **node_exporter** (system probe) — no credentials. Install
  [node_exporter](https://github.com/prometheus/node_exporter) on the host
  (a 5-line systemd unit) and the system probe scrapes `:9100/metrics`.
- **k8s** — in-cluster ServiceAccount, no env. RBAC in
  `deploy/dev/rbac.yaml`.

All adapters degrade gracefully when their env isn't set — they just return
`unknown`.

## Environment reference

See `api/.env.example` for the full list. Highlights:

- `SORACK_AUTH_SECRET` — session signing key (set this, otherwise sessions
  reset on every restart).
- `SORACK_ADMIN_USERNAME` / `SORACK_ADMIN_PASSWORD` — pin the initial
  admin; otherwise generated and logged once.
- `SORACK_COOKIE_SECURE` — defaults to `true`. Set `false` if you serve
  over plain http for local testing.
- `SORACK_ALLOWED_ORIGINS` — comma-separated CORS allowlist (only needed
  if the web UI is on a different origin than the api; same-origin
  deployments behind a reverse proxy don't need to set this).
- `SORACK_HEALTH_INTERVAL_MS` — probe sweep cadence (default 30s in code,
  set to 5s in the dev manifest for snappier UI).

## Production deployment

The included manifests run the app as a dev pod that mounts source via
hostPath (fast iteration, no rebuilds). A proper production setup —
multi-stage Dockerfile + an image-based Deployment — is on the roadmap.
For now you can:

- run the dev pod in your own cluster and treat it as production (works,
  but the pod restarts cold on every code update), or
- write your own Dockerfile (Vite `build` → static, api compiled with
  tsc) and skip the hostPath mount.

PRs adding a production Dockerfile + manifest are welcome.

## License

[MIT](./LICENSE)
