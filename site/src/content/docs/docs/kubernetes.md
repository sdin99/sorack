---
title: Deploy on Kubernetes
description: Self-host sorack on a Kubernetes cluster using the included manifests.
---

Install from the published image: `deploy/base` is a Kustomize base you point
an overlay at. Everything site-specific — namespace, image digest, storage
class, hostname — is deliberately absent from the base, so applying it without
an overlay fails loudly rather than guessing.

:::caution
This page used to lead with the **dev pod** under `deploy/dev`, which mounts a
checkout from the cluster node via `hostPath` and says an image-based install
"is on the roadmap". That has not been true since v0.1.0, and the dev pod was
never an install path: it needs the source on the node, and `hostPath` is one
of the volume types the project's own hardening check rejects. It is a
development setup and is now documented as one, at the bottom of this page.
:::

## Prerequisites

- A Kubernetes cluster with a default `StorageClass`.
- `kubectl` with Kustomize (built in since 1.14).
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

## 2. Write an overlay

The base carries no namespace, no image pin, no storage class and no hostname.
The full annotated template — including why the image is pinned by digest and
not by tag — is in
[`deploy/base/README.md`](https://github.com/sdin99/sorack/blob/main/deploy/base/README.md).
The shape:

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: sorack
resources:
  # A released tag, never a branch: a branch ref means someone else's push
  # silently re-renders your overlay.
  - github.com/sdin99/sorack//deploy/base?ref=v0.1.8
images:
  # A digest, not a tag. `newTag: sha-abc1234` looks equally specific and is
  # not — a tag is a mutable pointer, and this project has had one move
  # between two digests within a minute of a release.
  - name: ghcr.io/sdin99/sorack
    digest: sha256:...   # from the GHCR package page for that version
patches:
  - target: { kind: Deployment, name: sorack }
    patch: |
      apiVersion: apps/v1
      kind: Deployment
      metadata: { name: sorack }
      spec:
        template:
          spec:
            containers:
              - name: sorack
                env:
                  - name: POSTGRES_HOST
                    value: sorack-postgres.sorack.svc.cluster.local
                  - name: POSTGRES_DB
                    value: sorack
  - target: { kind: PersistentVolumeClaim, name: sorack-runbooks }
    patch: |
      - op: add
        path: /spec/storageClassName
        value: <your-storage-class>
```

## 3. Apply

```bash
kubectl apply -f deploy/postgres/
kubectl apply -k path/to/your/overlay
```

Migrations run automatically when the api boots — there's no separate migrate
step.

## 4. Open the UI

The image serves the api and the web bundle on one port.

```bash
kubectl port-forward -n sorack svc/sorack 8080:80
# then open http://localhost:8080
```

:::tip
The session cookie is marked `Secure`, so over plain HTTP (port-forward) the
login won't stick. Either front it with HTTPS, or set
`SORACK_COOKIE_SECURE: "false"` in the `sorack-app` Secret for local testing.
:::

The initial admin password is printed to the api log once on first boot if you
didn't pin `SORACK_ADMIN_PASSWORD`:

```bash
kubectl logs -n sorack deploy/sorack | grep -i password
```

## Developing on sorack

`deploy/dev` is a different thing and not an install path. It mounts a
checkout from the cluster node over `hostPath` and runs `pnpm dev` inside, so
edits on the node are live in the pod — useful if you are changing sorack, and
unsuitable for running it:

- it needs the source present on the node the pod lands on,
- `hostPath` is one of the volume types the project's own hardening check
  rejects, and a namespace with `pod-security.kubernetes.io/enforce=restricted`
  will not admit it,
- it serves Vite on 5173 rather than the single-port bundle, so the port and
  the container name differ from everything above.

Point it at your checkout and apply:

```yaml
volumes:
  - name: src
    hostPath:
      path: /home/youruser/projects/sorack
      type: Directory
```

```bash
kubectl apply -f deploy/postgres/
kubectl apply -f deploy/dev/
kubectl port-forward -n sorack svc/sorack 5173:80
```

The container is named `dev`, so logs need `-c dev`.
