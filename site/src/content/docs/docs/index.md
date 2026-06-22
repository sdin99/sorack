---
title: Quickstart
description: Run sorack locally in a few minutes, or self-host it on your cluster.
---

sorack is a standard web app — a **React (Vite)** frontend, a **Hono (Node)**
API, and **PostgreSQL**. Run it however you'd run a Node app plus Postgres. The
repo includes Kubernetes manifests, but they're *one* option, not a requirement.

## Try it locally

The fastest way to see it. You'll need **Node 22**, **pnpm**, and a **PostgreSQL**
instance — any will do. Here's one with Docker:

```bash
docker run -d --name sorack-pg \
  -e POSTGRES_USER=sorack -e POSTGRES_PASSWORD=sorack -e POSTGRES_DB=sorack \
  -p 5432:5432 postgres:17
```

Then clone, point the API at that Postgres, and start both dev servers:

```bash
git clone https://github.com/sdin99/sorack && cd sorack
pnpm install

export POSTGRES_HOST=localhost POSTGRES_DB=sorack \
       POSTGRES_USERNAME=sorack POSTGRES_PASSWORD=sorack \
       SORACK_COOKIE_SECURE=false   # serving over plain http locally

pnpm dev   # web → http://localhost:5173 · api → :3001
```

Migrations run automatically on API boot. Open <http://localhost:5173> — the
initial admin password is printed to the API log once (or pin it with
`SORACK_ADMIN_PASSWORD`). The full environment list is in
[Configuration](/docs/configuration/).

:::note
sorack reads configuration straight from `process.env`, so inject it however you
like — a shell `export` as above, `node --env-file`, a `.env` loader, or a
Kubernetes Secret.
:::

## Self-host

For a persistent deployment, the repo ships **Kubernetes manifests** — see
[Deploy on Kubernetes](/docs/kubernetes/). Since sorack is just a Node + Postgres
app, you can equally build your own image or run it under any process manager; a
first-class production image is on the roadmap.

## Where to next

Open the topology view and create your first node — pick an infra type, attach
software, then add a probe per axis and the StatusLine starts reporting. The
model is explained in [Concepts](/docs/concepts/).
