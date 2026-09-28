---
title: Troubleshooting
description: Common issues running sorack and how to fix them.
---

The commands on this page assume you installed sorack from the image, as
described in [Deploy on Kubernetes](/docs/kubernetes/). The image runs one
container named `sorack`, so the commands do not need `-c`.

If you run `deploy/dev` for development, see
[Developing on sorack](#developing-on-sorack) at the end of this page.

## The pod never becomes Ready

Run `kubectl describe pod` to see the cause. The most common causes are in the
overlay:

| `kubectl get pods` shows | Cause |
| --- | --- |
| `CreateContainerConfigError` | The `sorack-db` Secret does not exist. It holds `POSTGRES_USERNAME` and `POSTGRES_PASSWORD`, which have no defaults, so the pod cannot start without it. The error message names the missing Secret. The `sorack-app` Secret is optional and does not cause this error. |
| `Pending`, with the event `pod has unbound immediate PersistentVolumeClaims` | The runbooks PVC has no storage class. The base does not set one; set it in your overlay. |
| `ImagePullBackOff` | The pinned image cannot be pulled. If you pinned a digest, compare it with the GHCR package page for that version. A digest that no tag points to can be deleted from the registry. |

If the pod is Running but not Ready, check the logs. The readiness probe calls
`/api/health`. The usual cause is that PostgreSQL is unreachable: the api
retries migrations for up to 60 seconds and logs each attempt as
`[migrate] postgres not reachable`.

## Login succeeds but the next request is 401

The login form returns `POST /api/auth/login → 200`, and the next request
returns `GET /api/auth/me → 401`.

**Cause:** you are connecting over plain HTTP, for example through
`kubectl port-forward`. The session cookie is marked `Secure`, so the browser
does not send it over HTTP.

**Fix:** use one of these options.

- Serve sorack over HTTPS. Copy `examples/ingress.yaml` and set your hostname
  and TLS.
- For local testing, set `SORACK_COOKIE_SECURE: "false"` in the `sorack-app`
  Secret and restart:

```bash
kubectl patch secret sorack-app -n sorack --type=merge \
  -p '{"stringData":{"SORACK_COOKIE_SECURE":"false"}}'
kubectl rollout restart deploy/sorack -n sorack
```

## `relation "auth.users" does not exist`

The api runs migrations when it starts, so this error means the migration
failed. Check the api logs for the cause; it is usually that the database is
unreachable. To run migrations by hand:

```bash
kubectl exec -n sorack deploy/sorack -- node dist/db/migrate.js
```

This runs the same migration code the api runs at startup. Migrations that
have already been applied are skipped.

## Where's the initial admin password?

If you did not set `SORACK_ADMIN_PASSWORD`, the api generates a password on
first start and prints it to the log:

```bash
kubectl logs -n sorack deploy/sorack | grep -A5 "Initial admin"
```

The password is printed only when the admin user is created. Restarting the
pod does not print it again.

## Lost the admin password

sorack has no password reset. Delete the user rows and restart; sorack then
creates the admin user again with a new password.

```bash
kubectl exec -n sorack sorack-postgres-0 -- sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d sorack -c "delete from auth.users;"'
kubectl rollout restart deploy/sorack -n sorack
```

:::caution
This deletes all users, not only the admin, and ends their sessions. If other
users exist, update the admin row instead.
:::

## Everyone got logged out after a pod restart

`SORACK_AUTH_SECRET` is not set, so the api generates a new one on each start
and existing sessions stop working. Set it in the `sorack-app` Secret:

```bash
openssl rand -base64 48
# add the output as SORACK_AUTH_SECRET in sorack-app, then:
kubectl rollout restart deploy/sorack -n sorack
```

## Developing on sorack

This section applies only to `deploy/dev`, the development setup described in
[Developing on sorack](/docs/kubernetes/#developing-on-sorack). It mounts a
checkout from the node and runs `pnpm dev` in a container named `dev`, with the
code at `/workspace`. It serves Vite on port 5173. Commands for it need
`-c dev`:

```bash
kubectl logs -n sorack deploy/sorack -c dev
kubectl exec -n sorack deploy/sorack -c dev -- sh -lc \
  'export PATH=/workspace/.pnpm-home:$PATH; cd /workspace/api && pnpm db:migrate'
```

### The pod stays in `ContainerCreating` for a long time

On first start, the dev pod installs dependencies and starts Vite and tsx.
This can take a few minutes. After that, code changes reload automatically.
The image install does not do this; if an image-based pod is slow to start, see
[The pod never becomes Ready](#the-pod-never-becomes-ready).

### `pnpm install` aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`

You ran `pnpm install` on the host before mounting the checkout with
`hostPath`, so the pod sees a `node_modules` built for a different libc. The
current `deploy/dev/deployment.yaml` passes `--config.confirmModulesPurge=false`
to skip this prompt. If you have an older copy, update it.

:::caution
If the checkout is shared with a running pod, do not confirm the prompt or pass
that flag on the host. Either removes the `node_modules` the pod is using, and
the pod stops working until the next install finishes.
:::
