---
title: Configuration
description: Environment variables for the sorack api.
---

sorack reads its configuration from environment variables. You can set them
with a Kubernetes Secret, `docker -e`, or a local `.env` file. The complete list
is in [`api/.env.example`](https://github.com/sdin99/sorack/blob/main/api/.env.example).
The most common ones are below.

## Postgres (required)

| Variable            | Default     | Notes                       |
| ------------------- | ----------- | --------------------------- |
| `POSTGRES_HOST`     | `localhost` |                             |
| `POSTGRES_PORT`     | `5432`      |                             |
| `POSTGRES_DB`       | `sorack`    |                             |
| `POSTGRES_USERNAME` | `sorack`    |                             |
| `POSTGRES_PASSWORD` | —           | Required.                   |

## Auth

| Variable                 | Default | Notes                                                                 |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `SORACK_AUTH_SECRET`     | Random  | Secret used when hashing session tokens. Set it; if it is unset, a new value is generated at each start and every session ends. Generate one with `openssl rand -base64 48`. |
| `SORACK_ADMIN_USERNAME`  | `admin` | Initial admin user.                                                   |
| `SORACK_ADMIN_PASSWORD`  | Random  | If unset, a password is generated on first start and printed to the log once. |
| `SORACK_COOKIE_SECURE`   | `true`  | Set to `false` only when serving over plain HTTP locally.             |
| `SORACK_ALLOWED_ORIGINS` | —       | Comma-separated CORS allowlist. Needed only if the web UI is served from a different origin than the api. |

## Health collector

| Variable                     | Default | Notes                                       |
| ---------------------------- | ------- | ------------------------------------------- |
| `SORACK_HEALTH_ENABLED`      | `true`  | Set to `false` to turn off the collector.   |
| `SORACK_HEALTH_INTERVAL_MS`  | `30000` | How often to check (the dev manifest uses 5000). |
| `SORACK_HEALTH_TIMEOUT_MS`   | `5000`  | Timeout for each probe. A probe can override it. |

## Runbooks & misc

| Variable               | Default | Notes                                            |
| ---------------------- | ------- | ------------------------------------------------ |
| `SORACK_RUNBOOKS_DIR`  | —       | Directory for runbook `.md` files.               |
| `PORT`                 | `3001`  | API port.                                        |

## Git sync for runbooks

Git sync is optional. Without it, the files in `SORACK_RUNBOOKS_DIR` are the
source of truth and the database caches them. A git remote is an optional
layer on top of that directory.

| Variable                   | Default  | Notes                                              |
| -------------------------- | -------- | -------------------------------------------------- |
| `SORACK_GIT_ENABLED`       | —        | Required when you configure git with environment variables. See below. |
| `SORACK_GIT_REMOTE`        | —        | Clone and push URL.                                 |
| `SORACK_GIT_BRANCH`        | `main`   |                                                     |
| `SORACK_GIT_USERNAME`      | —        | For GitHub, any non-empty value. The token authenticates. |
| `SORACK_GIT_TOKEN`         | —        | Personal access token with write access to the repository. |
| `SORACK_GIT_AUTHOR_NAME`   | `sorack` | Commit author.                                      |
| `SORACK_GIT_AUTHOR_EMAIL`  | —        |                                                     |

:::caution[Set `SORACK_GIT_ENABLED=true` when you configure git with environment variables]
Git sync is turned on by a setting stored in the database, which the Settings
screen writes. If you configure sorack only with environment variables, that
setting does not exist and git sync stays off.

If you set only `SORACK_GIT_REMOTE` and `SORACK_GIT_TOKEN`, sorack does not
sync, and `/api/git/pull` returns `412 not configured`.
:::

Environment variables take precedence over values saved in the Settings
screen, one field at a time. The Settings screen disables fields that are set
by an environment variable and shows where each value comes from. If you set a
field in the UI and later set it with an environment variable, the environment
variable is used.

`SORACK_GIT_TOKEN_KEY` encrypts a token that is saved through the Settings
screen and stored in the database. If you configure git only with environment
variables, you do not need it. If you set it, it must be exactly 32 bytes,
base64-encoded (`openssl rand -base64 32`); otherwise the api does not start.

### Already have runbooks and want a remote now?

If the runbooks directory has files, a remote is configured, and the directory
is not yet a git repository, **Settings → Runbook** shows an **Adopt into
remote** button. It commits the existing files and pushes them. If the remote
already has commits, sorack merges the two histories. If both sides have a file
with the same name, sorack stops without changing anything and lists the
conflicting files.

Credentials for optional adapters, such as Proxmox, are described in
[Probes & adapters](/docs/adapters/).
