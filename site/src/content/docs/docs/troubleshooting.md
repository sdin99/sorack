---
title: Troubleshooting
description: Common issues running sorack and how to fix them.
---

The commands here assume an **image install** — the one container from
[Deploy on Kubernetes](/docs/kubernetes/), named `sorack`, serving the api and
the web bundle on one port. Nothing on this page needs `-c <container>`.

If you are running `deploy/dev` instead, that is a development setup and not an
install; its own failures are at the [bottom of this page](#developing-on-sorack).

## The pod never becomes Ready

`kubectl describe pod` names the cause; the two you are most likely to hit are
both in the overlay rather than in sorack.

| `kubectl get pods` shows | Cause |
| --- | --- |
| `CreateContainerConfigError` | The `sorack-db` Secret does not exist. It holds `POSTGRES_USERNAME` and `POSTGRES_PASSWORD`, which have no sensible default, so it is a hard requirement and fails at admission — the message names the missing secret. (`sorack-app` *is* optional and its absence is not this.) |
| `Pending`, event `pod has unbound immediate PersistentVolumeClaims` | The runbooks PVC has no storage class. The base deliberately sets none; your overlay has to. |
| `ImagePullBackOff` | The image pin does not resolve. If you pinned a digest, check it against the GHCR package page for that version — a digest that was valid can be garbage-collected once nothing tags it. |

A pod that is Running but never Ready is a different thing: the readiness probe
polls `/api/health`, so check the logs. The usual answer is Postgres — the api
retries a migration for up to 60 seconds and logs each attempt with
`[migrate] postgres not reachable`.

## Login succeeds but the next request is 401

You submit the login form, see `POST /api/auth/login → 200`, then immediately
`GET /api/auth/me → 401`.

**Cause:** you're reaching the app over plain HTTP (e.g. `kubectl port-forward`).
The session cookie is set with `Secure`, so the browser drops it on non-HTTPS
origins.

**Fix** (one of):

- Front it with HTTPS (copy `examples/ingress.yaml`, set your hostname + TLS).
- For local testing, set `SORACK_COOKIE_SECURE: "false"` in the `sorack-app`
  Secret and restart:

```bash
kubectl patch secret sorack-app -n sorack --type=merge \
  -p '{"stringData":{"SORACK_COOKIE_SECURE":"false"}}'
kubectl rollout restart deploy/sorack -n sorack
```

## `relation "auth.users" does not exist`

Migrations run automatically on api boot, so this means the migration step
failed rather than that it was never run — check the api logs for the cause
(most often the database being unreachable). To run it by hand:

```bash
kubectl exec -n sorack deploy/sorack -- node dist/db/migrate.js
```

The migration runner is a second entry point in the same module the api calls
at startup, and it resolves the `.sql` files relative to its own file, so it
works from the compiled output with no extra tooling in the image. It is
idempotent — already-applied migrations are skipped.

## Where's the initial admin password?

If you didn't set `SORACK_ADMIN_PASSWORD`, the api generates one on first boot
and logs it once:

```bash
kubectl logs -n sorack deploy/sorack | grep -A5 "Initial admin"
```

:::caution
"Once" is literal. The line is printed only when the user row is actually
created, so restarting the pod does not print it again — with a user row
present the bootstrap does nothing. That pod's log is the only copy.
:::

## Lost the admin password

There is no reset flow. Delete the admin row and restart: the bootstrap sees no
user and generates a new password.

```bash
kubectl exec -n sorack sorack-postgres-0 -- sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d sorack -c "delete from auth.users;"'
kubectl rollout restart deploy/sorack -n sorack
```

This deletes every user row, not just the admin, and it invalidates their
sessions. On a single-operator install that is the whole point; on anything
else, update the one row instead.

## Everyone got logged out after a pod restart

`SORACK_AUTH_SECRET` isn't set, so the api generates a random one each boot and
old session tokens stop validating. Set it in the `sorack-app` Secret:

```bash
openssl rand -base64 48
# add the output as SORACK_AUTH_SECRET in sorack-app, then:
kubectl rollout restart deploy/sorack -n sorack
```

## Developing on sorack

These apply to `deploy/dev` only — the hostPath setup described under
[Developing on sorack](/docs/kubernetes/#developing-on-sorack). It mounts a
checkout from the node and runs `pnpm dev` inside, so its container is named
`dev`, its code lives at `/workspace`, and it serves Vite on 5173 rather than
the single-port bundle. Commands aimed at it need `-c dev`:

```bash
kubectl logs -n sorack deploy/sorack -c dev
kubectl exec -n sorack deploy/sorack -c dev -- sh -lc \
  'export PATH=/workspace/.pnpm-home:$PATH; cd /workspace/api && pnpm db:migrate'
```

### The pod stays in `ContainerCreating` for a long time

First boot installs the dependencies and starts both Vite and tsx. A couple of
minutes is normal; after that, code edits hot-reload. An image install does not
do this — if a `deploy/base` pod is slow to start, see
[above](#the-pod-never-becomes-ready).

### `pnpm install` aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`

You ran `pnpm install` on the host before mounting via `hostPath`, so the pod
sees a `node_modules` built against a different libc. The deployment passes
`--config.confirmModulesPurge=false` so newer checkouts skip the prompt; pull
the latest `deploy/dev/deployment.yaml` if you're on an older copy.

:::caution
The prompt is the only thing standing between you and a purge of a
`node_modules` the pod is using. If the checkout is shared with a running pod,
answering yes — or passing the flag on the host rather than in the pod — breaks
it until the next install completes.
:::
