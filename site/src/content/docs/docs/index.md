---
title: Quickstart
description: Run sorack locally in a few minutes, or self-host it on your cluster.
---

sorack is a web app with a React (Vite) frontend, a Hono (Node) API, and a
PostgreSQL database. You can run it anywhere you can run a Node app and
Postgres. The repository includes Kubernetes manifests, but Kubernetes is not
required.

## Try it locally

You need Node 22, pnpm, and a PostgreSQL instance. Any PostgreSQL works. To
start one with Docker:

```bash
docker run -d --name sorack-pg \
  -e POSTGRES_USER=sorack -e POSTGRES_PASSWORD=sorack -e POSTGRES_DB=sorack \
  -p 5432:5432 postgres:17
```

Clone the repository, point the API at that database, and start the dev
servers:

```bash
git clone https://github.com/sdin99/sorack && cd sorack
pnpm install

export POSTGRES_HOST=localhost POSTGRES_DB=sorack \
       POSTGRES_USERNAME=sorack POSTGRES_PASSWORD=sorack \
       SORACK_COOKIE_SECURE=false   # serving over plain http locally

pnpm dev   # web → http://localhost:5173 · api → :3001
```

The API runs database migrations when it starts. Open <http://localhost:5173>.
The initial admin password is printed once to the API log. To choose your own,
set `SORACK_ADMIN_PASSWORD`. All environment variables are listed in
[Configuration](/docs/configuration/).

:::note
sorack reads its configuration from `process.env`. You can set it with a shell
`export` as above, `node --env-file`, a `.env` loader, or a Kubernetes Secret.
:::

## Self-host

For a long-running deployment, use the published image,
`ghcr.io/sdin99/sorack`. It is a single container that serves the API and the
web UI on one port. A Kustomize base is included for Kubernetes; see
[Deploy on Kubernetes](/docs/kubernetes/). You can also build your own image or
run sorack under any process manager.

## Where to next

Open the topology view and create your first node. Pick an infra type, attach
software, and add a probe to each axis. The StatusLine then starts reporting
status. [Concepts](/docs/concepts/) explains the model.
