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

Optional adapter credentials (Proxmox, etc.) are covered in
[Probes & adapters](/docs/adapters/).
