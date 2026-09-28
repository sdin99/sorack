---
title: Deploy on Kubernetes
description: Self-host sorack on a Kubernetes cluster using the included manifests.
---

sorack runs on Kubernetes from the published image, `ghcr.io/sdin99/sorack`.
`deploy/base` is a Kustomize base. You write an overlay that points at it and
adds the values specific to your cluster: namespace, image digest, storage
class, and hostname. The base leaves these out, so applying it without an
overlay fails instead of guessing.

:::note
`deploy/dev` is a development setup, not an installation method. It mounts
source code from the node through `hostPath`. See
[Developing on sorack](#developing-on-sorack).
:::

## Prerequisites

- A Kubernetes cluster with a default `StorageClass`.
- `kubectl` with Kustomize (built in since 1.14).
- Optional: an ingress controller and cert-manager, if you want HTTPS through
  an Ingress. Otherwise `kubectl port-forward` is enough.

## 1. Create the Secrets

sorack uses two Secrets, so you can rotate database and app settings
separately:

| Secret       | Source                     | Used by                    |
| ------------ | -------------------------- | -------------------------- |
| `sorack-db`  | `examples/secret-db.yaml`  | postgres statefulset + api |
| `sorack-app` | `examples/secret-app.yaml` | api only                   |

```bash
kubectl create namespace sorack

# Copy the examples and fill in real values. Do not commit the filled-in copies.
cp examples/secret-db.yaml  /tmp/sorack-db.yaml
cp examples/secret-app.yaml /tmp/sorack-app.yaml
$EDITOR /tmp/sorack-db.yaml /tmp/sorack-app.yaml
kubectl apply -f /tmp/sorack-db.yaml
kubectl apply -f /tmp/sorack-app.yaml
```

## 2. Write an overlay

The base has no namespace, image pin, storage class, or hostname. A full
annotated template is in
[`deploy/base/README.md`](https://github.com/sdin99/sorack/blob/main/deploy/base/README.md).
A minimal overlay looks like this:

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: sorack
resources:
  # Pin a release tag from https://github.com/sdin99/sorack/releases.
  # A branch ref changes whenever someone pushes to it.
  - github.com/sdin99/sorack//deploy/base?ref=<version>
images:
  # Pin by digest. A tag can be moved to a different image.
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

The api runs database migrations when it starts. There is no separate migration
step.

## 4. Open the UI

The image serves the api and the web UI on one port.

```bash
kubectl port-forward -n sorack svc/sorack 8080:80
# then open http://localhost:8080
```

The session cookie is marked `Secure`, so login does not persist over plain
HTTP such as a port-forward. Put the service behind HTTPS, or for local testing
set `SORACK_COOKIE_SECURE: "false"` in the `sorack-app` Secret.

If you did not set `SORACK_ADMIN_PASSWORD`, the api generates an admin password
and prints it to its log once, on first start:

```bash
kubectl logs -n sorack deploy/sorack | grep -i password
```

## Developing on sorack

`deploy/dev` is for working on sorack itself. It mounts a checkout from the
node through `hostPath` and runs `pnpm dev` inside the pod, so edits on the
node take effect immediately. Do not use it to run sorack:

- The source must be present on the node where the pod runs.
- It uses a `hostPath` volume, which the project's security settings check
  rejects. Namespaces that enforce the `restricted` Pod Security Standard do
  not admit it.
- It serves Vite on port 5173 instead of the single-port image, so the port
  and container name differ from the steps above.

Point the volume at your checkout and apply:

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

The container is named `dev`, so `kubectl logs` needs `-c dev`.
