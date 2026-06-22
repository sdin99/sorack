---
title: Quickstart
description: Get sorack running on a Kubernetes cluster and open your homelab as a live map.
---

sorack is a self-hosted control plane for your homelab — an inventory, a live
topology graph, per-axis monitoring and node-linked runbooks in one dashboard.
This page gets it running on a cluster.

## Prerequisites

- A Kubernetes cluster with a default `StorageClass`.
- A clone of this repo on the cluster node that will host the dev pod (the pod
  mounts the source via `hostPath`).
- Optional: an ingress controller + cert-manager if you want HTTPS via an
  Ingress; otherwise `kubectl port-forward` works fine.

## 1. Create the Secrets

Two Secrets keep DB and app config rotating independently:

| Secret       | Source                     | Consumed by                |
| ------------ | -------------------------- | -------------------------- |
| `sorack-db`  | `examples/secret-db.yaml`  | postgres statefulset + api |
| `sorack-app` | `examples/secret-app.yaml` | api only                   |

```bash
kubectl apply -f deploy/dev/namespace.yaml

# Copy + fill in real values (don't commit the filled-in copies)
cp examples/secret-db.yaml  /tmp/sorack-db.yaml
cp examples/secret-app.yaml /tmp/sorack-app.yaml
$EDITOR /tmp/sorack-db.yaml /tmp/sorack-app.yaml
kubectl apply -f /tmp/sorack-db.yaml
kubectl apply -f /tmp/sorack-app.yaml
```

## 2. Point the dev pod at your checkout

`deploy/dev/deployment.yaml` mounts a `hostPath`. Change it to wherever you
cloned the repo on the node:

```yaml
volumes:
  - name: src
    hostPath:
      path: /home/youruser/projects/sorack
      type: Directory
```

## 3. Apply the rest

```bash
kubectl apply -f deploy/postgres/
kubectl apply -f deploy/dev/
```

Migrations run automatically when the api boots — there's no separate migrate
step.

## 4. Open the UI

```bash
kubectl port-forward -n sorack svc/sorack 5173:80
# then open http://localhost:5173
```

:::tip
The session cookie is marked `Secure`, so over plain HTTP (port-forward) the
login won't stick. Either front it with HTTPS, or set
`SORACK_COOKIE_SECURE: "false"` in the `sorack-app` Secret for local testing.
:::

The initial admin password is printed to the api log once on first boot if you
didn't pin `SORACK_ADMIN_PASSWORD`:

```bash
kubectl logs -n sorack deploy/sorack -c dev | grep -i password
```

## Where to next

Open the topology view and create your first node directly on the canvas — pick
an infra type, then attach software. From there, attach a probe per axis and the
StatusLine starts reporting.
