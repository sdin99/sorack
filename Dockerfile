# Sorack production image — one container, one port.
#
# The api serves both /api/* and the built web bundle (see server.ts, the
# SORACK_STATIC_DIR block). Self-hosters get a single image and a single
# port instead of a static-server sidecar plus reverse-proxy wiring; the
# only thing in front of it needs to be an ingress that terminates TLS.
#
#   docker build -t sorack .
#   docker run -p 3001:3001 --env-file api/.env -v ./runbooks:/runbooks sorack
#
# Dev does NOT use this image — `pnpm dev` runs Vite (:5173) + tsx api
# (:3001) with hot reload. See deploy/dev/ and the docs.

# ── build ────────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /src

RUN corepack enable

# Manifests first so `pnpm install` is cached independently of source
# edits — a code-only change skips the whole dependency step on rebuild.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

COPY . .
# api → api/dist (tsc), web → web/dist (vite). `pnpm build` runs both and
# typechecks on the way, so a type error fails the image build.
RUN pnpm build

# tsc emits .js only. The migration runner resolves ./migrations relative to
# its own file (db/migrate.ts), so the .sql files have to be placed next to
# the compiled output or the api crash-loops on first boot.
RUN cp -r api/src/db/migrations api/dist/db/migrations

# Self-contained prod node_modules for the api package alone.
#
# Three flags, each load-bearing:
#   --legacy       pnpm 10 refuses to deploy a non-injected workspace without
#                  it (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE).
#   node-linker=hoisted  emits a flat, symlink-free node_modules. The default
#                  virtual store is a web of relative symlinks that does not
#                  survive being COPYed into another stage.
#   target inside /src   deploying to a path outside the workspace makes pnpm
#                  compute a bad relative bin path and fail with EACCES.
RUN pnpm --filter sorack-api --prod deploy --legacy \
      --config.node-linker=hoisted /src/.deploy

# ── runtime ──────────────────────────────────────────────────────────
# Same digest as the build stage — one base to track, one Renovate bump.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /app

# node:*-alpine ships a `node` user at uid 1000. Declared numerically, not by
# name: Kubernetes cannot resolve a username to check `runAsNonRoot`, so a
# `USER node` image is rejected with "non-numeric user, cannot verify user is
# non-root" before the container ever starts.
ENV NODE_ENV=production \
    PORT=3001 \
    SORACK_STATIC_DIR=./public \
    SORACK_RUNBOOKS_DIR=/runbooks

COPY --from=build --chown=node:node /src/.deploy/node_modules ./node_modules
COPY --from=build --chown=node:node /src/.deploy/package.json ./package.json
COPY --from=build --chown=node:node /src/api/dist ./dist
COPY --from=build --chown=node:node /src/web/dist ./public

# ‼ Our own terms travel with the artifact. Measured on 0.1.10: the image
# carried 258 licence files — node's own, npm's, and one for each runtime
# dependency, because those ship inside their package directories — and not
# sorack's. Someone who pulls the image and never sees the repository had the
# code and no statement of what they may do with it. The OCI label says MIT,
# which a scanner reads and a person does not.
#
# This covers sorack only. The Alpine base contributes sixteen packages whose
# own licence texts are absent from that layer (Alpine's minimal images do not
# ship /usr/share/licenses); that is a separate question and not one a COPY
# line answers.
COPY --from=build --chown=node:node /src/LICENSE ./LICENSE

# The runbooks dir is a mount point in every real deployment; create it so
# the api can start even when nothing is mounted (empty dir → empty list).
RUN mkdir -p /runbooks && chown node:node /runbooks

USER 1000:1000
EXPOSE 3001

# No HEALTHCHECK here on purpose — Kubernetes probes the endpoint itself
# (see deploy/base/deployment.yaml) and a container-level healthcheck would
# just duplicate it with different semantics. For plain `docker run`, poll
# GET /api/health.
CMD ["node", "dist/server.js"]
