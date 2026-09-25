---
title: Configuration
description: Environment variables for the sorack api.
---

sorack reads everything from `process.env`, so inject configuration however you
deploy — a Kubernetes Secret, `docker -e`, or a local `.env`. The full list
lives in [`api/.env.example`](https://github.com/sdin99/sorack/blob/main/api/.env.example);
the highlights are below.

## Postgres (required)

| Variable            | Default     | Notes                       |
| ------------------- | ----------- | --------------------------- |
| `POSTGRES_HOST`     | `localhost` |                             |
| `POSTGRES_PORT`     | `5432`      |                             |
| `POSTGRES_DB`       | `sorack`    |                             |
| `POSTGRES_USERNAME` | `sorack`    |                             |
| `POSTGRES_PASSWORD` | —           | required                    |

## Auth

| Variable                 | Default | Notes                                                                 |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `SORACK_AUTH_SECRET`     | random  | Session-token pepper. **Set this** — otherwise sessions reset on every restart. Generate with `openssl rand -base64 48`. |
| `SORACK_ADMIN_USERNAME`  | `admin` | Initial admin.                                                        |
| `SORACK_ADMIN_PASSWORD`  | random  | If unset, generated on first boot and printed to the log once.        |
| `SORACK_COOKIE_SECURE`   | `true`  | Set `false` only when serving over plain HTTP locally.                |
| `SORACK_ALLOWED_ORIGINS` | —       | Comma-separated CORS allowlist. Only needed if the web UI is on a different origin than the api. |

## Health collector

| Variable                     | Default | Notes                                       |
| ---------------------------- | ------- | ------------------------------------------- |
| `SORACK_HEALTH_ENABLED`      | `true`  | Set `false` to turn the poller off.         |
| `SORACK_HEALTH_INTERVAL_MS`  | `30000` | Sweep cadence (the dev manifest sets 5000). |
| `SORACK_HEALTH_TIMEOUT_MS`   | `5000`  | Per-probe timeout (a probe can override).   |

## Runbooks & misc

| Variable               | Default | Notes                                            |
| ---------------------- | ------- | ------------------------------------------------ |
| `SORACK_RUNBOOKS_DIR`  | —       | Directory for runbook `.md` files (file backend).|
| `PORT`                 | `3001`  | API port.                                        |

## Git sync for runbooks

Optional. Runbooks work with no git at all — the files in `SORACK_RUNBOOKS_DIR`
are the source of truth and the database is a cache of them. A remote is a
layer over that directory, not a requirement for having one.

| Variable                   | Default  | Notes                                              |
| -------------------------- | -------- | -------------------------------------------------- |
| `SORACK_GIT_ENABLED`       | —        | **Required if you configure git by env.** See below.|
| `SORACK_GIT_REMOTE`        | —        | Clone/push URL.                                     |
| `SORACK_GIT_BRANCH`        | `main`   |                                                     |
| `SORACK_GIT_USERNAME`      | —        | Any non-empty value for GitHub; the token authenticates. |
| `SORACK_GIT_TOKEN`         | —        | Personal access token, write scope on the repo.     |
| `SORACK_GIT_AUTHOR_NAME`   | `sorack` | Commit author.                                      |
| `SORACK_GIT_AUTHOR_EMAIL`  | —        |                                                     |

:::caution[`SORACK_GIT_ENABLED` is not optional when you use env]
Storage mode is a toggle, and the toggle lives in the database row the
Settings screen writes. With no row — which is the normal state for a
deployment configured entirely by environment — it reads `false`, and git
stays off no matter what else you set.

Setting `SORACK_GIT_REMOTE` and `SORACK_GIT_TOKEN` and nothing else produces
an instance that looks configured and is idle: `/api/git/pull` answers `412
not configured` and nothing tells you why.
:::

Env wins over the stored row, field by field, and the Settings screen greys
out the fields env has pinned. A field you set in the UI first and by env
later becomes the env value, so check the screen — it shows what git actually
uses, and labels where each value came from.

`SORACK_GIT_TOKEN_KEY` is unrelated: it encrypts a token *stored in the
database* by the Settings screen. An env-configured deployment never decrypts
anything and does not need it. If you do set it, it must be exactly 32 bytes
of base64 (`openssl rand -base64 32`) or the api refuses to start.

### Already have runbooks and want a remote now?

Settings → Runbook shows an **Adopt into remote** button when the directory
has files, a remote is configured, and it is not a repository yet. It commits
what is there and pushes it. If the remote already has commits, the two are
merged; if both sides have a file with the same name it refuses and names the
files, having written nothing.

Optional adapter credentials (Proxmox, etc.) are covered in
[Probes & adapters](/docs/adapters/).
