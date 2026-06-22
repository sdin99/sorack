---
title: Troubleshooting
description: Common issues running sorack and how to fix them.
---

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

Migrations run automatically on api boot. This error means the migration step is
failing — check the api logs for the underlying cause (most often DB
connectivity). To run it manually:

```bash
kubectl exec -n sorack deploy/sorack -c dev -- sh -lc \
  'export PATH=/workspace/.pnpm-home:$PATH; cd /workspace/api && pnpm db:migrate'
```

## Where's the initial admin password?

If you didn't set `SORACK_ADMIN_PASSWORD`, the api generates one on first boot
and logs it once:

```bash
kubectl logs -n sorack -l app=sorack -c dev | grep -A5 "Initial admin"
```

Lost it? Delete the admin row and restart — a new password gets generated:

```bash
kubectl exec -n sorack sorack-postgres-0 -- sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d sorack -c "delete from auth.users;"'
kubectl rollout restart deploy/sorack -n sorack
```

## Everyone got logged out after a pod restart

`SORACK_AUTH_SECRET` isn't set, so the api generates a random one each boot and
old session tokens stop validating. Set it in the `sorack-app` Secret:

```bash
openssl rand -base64 48
# add the output as SORACK_AUTH_SECRET in sorack-app, then:
kubectl rollout restart deploy/sorack -n sorack
```

## Pod stays in `ContainerCreating` for a long time

First boot installs the dependencies and starts both Vite and tsx. A couple of
minutes is normal; after that, code edits hot-reload.

## `pnpm install` aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`

You ran `pnpm install` on the host before mounting via `hostPath`, so the pod
sees a different-libc `node_modules`. The deployment passes
`--config.confirmModulesPurge=false` so newer checkouts skip the prompt; pull
the latest `deploy/dev/deployment.yaml` if you're on an older copy.
