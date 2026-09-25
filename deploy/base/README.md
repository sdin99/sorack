# `deploy/base` — generic Kubernetes base

A deployment-agnostic kustomize base for the packaged image (see the repo
`Dockerfile`). One container serves `/api/*` and the built web bundle on port
3001; put an ingress in front of it to terminate TLS.

**This base is not applyable on its own.** It carries no namespace, no image
pin, no storage class and no hostname — those differ per deployment and are
the overlay's job. Applying it directly fails at image pull, which is
intentional: a missing pin should be loud.

## What an overlay must supply

| | Why it is not in the base |
|---|---|
| `namespace` | Site-specific. Also patch the ClusterRoleBinding subject namespace if it is not `sorack`. |
| image pin (`images:`) | A base must not carry a mutable tag. Pin a digest or `sha-<git>`. |
| `POSTGRES_HOST` / `POSTGRES_DB` | Deliberately empty so one postgres can host several instances without either migrating the other's schema. Migrations run on boot. |
| `storageClassName` on `sorack-runbooks` | Omitting it silently means "cluster default", which is rarely what you want. |
| Secrets `sorack-db`, `sorack-app` | Never in Git as plaintext. Use SealedSecrets / External Secrets / your own tooling. Keys: `examples/secret-db.yaml`, `examples/secret-app.yaml`. |
| Ingress | Hostname and TLS issuer are site-specific. `examples/ingress.yaml` is a starting point. |

## Minimal overlay

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: sorack
resources:
  # A tag, never a branch: a branch ref means someone else's push
  # silently re-renders your overlay.
  - github.com/sdin99/sorack//deploy/base?ref=v0.1.0
images:
  - name: ghcr.io/sdin99/sorack
    newTag: sha-abc1234
patches:
  # Strategic merge, not a JSON patch by index. `name` is the merge key for
  # env entries, so this keeps working when the base adds a variable —
  # an index-based `/env/0/value` would silently overwrite whatever moved
  # into slot 0.
  - target: { kind: Deployment, name: sorack }
    patch: |
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: sorack
      spec:
        template:
          spec:
            containers:
              - name: sorack
                env:
                  - name: POSTGRES_HOST
                    value: postgres.<namespace>.svc.cluster.local
                  - name: POSTGRES_DB
                    value: sorack
  - target: { kind: PersistentVolumeClaim, name: sorack-runbooks }
    patch: |
      - op: add
        path: /spec/storageClassName
        value: <your-storage-class>
```

## Notes that bit us, so they are written down

- **Probes hit `/api/health`, not the TCP port.** The failure this catches is
  the api dying while something else still answers on the socket; a
  `tcpSocket` probe reports Ready straight through that.
- **`readOnlyRootFilesystem: true`** means the only writable paths are the
  runbooks PVC and an `emptyDir` at `/tmp`. If you add a feature that writes
  elsewhere, mount it — do not relax the flag.
- **`automountServiceAccountToken: true` is deliberate.** The k8s health
  adapter needs the API; the bound role is get/list only and touches no
  secrets. Drop both if you do not use the `k8s` probe type.
- **`replicas: 1` is a correctness constraint, not a resource choice.** The
  runbooks volume is RWO and the api holds a file watcher and a git working
  tree on it.
- **`sorack-db` is not an optional secretRef; `sorack-app` is.** The database
  credentials have no default, so a missing secret should fail at admission —
  `CreateContainerConfigError` names the missing secret, while `optional: true`
  turns it into a CrashLoopBackOff you have to read logs to explain, and only
  fails at all because the code happens to check. `sorack-app` really can be
  absent: its values either self-generate or belong to an adapter you may not
  use.
- **Egress policy:** four of the five health adapters connect to targets the
  operator configures at runtime, so an egress allowlist cannot be derived
  ahead of time. Blocking a probe makes Sorack paint the *monitored* node
  red — the tool reports its own network policy as someone else's outage.
  Restrict ingress freely; be careful with egress.

## Backups

The database holds topology and runbook metadata; runbook *content* lives in
the PVC (and in git, when sync is on). Both need backing up, and a restore
should be exercised at least once — a backup nobody has restored is a guess.
