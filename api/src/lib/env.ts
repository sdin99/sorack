import { randomBytes } from "node:crypto";

// Centralized env access. Throws early if a required var is missing.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

// AUTH_SECRET is the pepper mixed into session-token hashes. We don't
// force it (keeps first-run friction low for self-hosters), but a
// missing secret means a fresh random one each boot → sessions don't
// survive a restart. Never ship a hardcoded default.
function authSecret(): string {
  const v = process.env.SORACK_AUTH_SECRET;
  if (v) return v;
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] SORACK_AUTH_SECRET not set — generated a random one. " +
      "Sessions will be invalidated on restart. Set SORACK_AUTH_SECRET to persist them.",
  );
  return randomBytes(32).toString("base64");
}

// AES-256-GCM key for PATs stored in docs.git_config. Same model as
// AUTH_SECRET — missing → random + warn, but the consequence is that
// stored tokens become unreadable on restart and the user re-enters the
// PAT in Settings. 32 bytes base64 (`openssl rand -base64 32`).
function gitTokenKey(): string {
  const v = process.env.SORACK_GIT_TOKEN_KEY;
  if (v) {
    if (Buffer.from(v, "base64").length !== 32) {
      throw new Error(
        "SORACK_GIT_TOKEN_KEY must be 32 bytes base64 — " +
          "generate with `openssl rand -base64 32`.",
      );
    }
    return v;
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[git] SORACK_GIT_TOKEN_KEY not set — generated a random key. " +
      "Stored PATs become unreadable on restart. " +
      "Set SORACK_GIT_TOKEN_KEY (`openssl rand -base64 32`) to persist.",
  );
  return randomBytes(32).toString("base64");
}

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  POSTGRES_HOST: process.env.POSTGRES_HOST ?? "sorack-postgres.sorack.svc.cluster.local",
  POSTGRES_PORT: Number(process.env.POSTGRES_PORT ?? 5432),
  POSTGRES_DB: process.env.POSTGRES_DB ?? "sorack",
  POSTGRES_USERNAME: required("POSTGRES_USERNAME"),
  POSTGRES_PASSWORD: required("POSTGRES_PASSWORD"),

  // ── auth ──
  AUTH_SECRET: authSecret(),
  GIT_TOKEN_KEY: gitTokenKey(),
  ADMIN_USERNAME: process.env.SORACK_ADMIN_USERNAME ?? "admin",
  ADMIN_PASSWORD: process.env.SORACK_ADMIN_PASSWORD, // optional → bootstrap generates
  COOKIE_SECURE: (process.env.SORACK_COOKIE_SECURE ?? "true") !== "false",

  // ── health collector ── (all optional; degrade gracefully)
  HEALTH_ENABLED: (process.env.SORACK_HEALTH_ENABLED ?? "true") !== "false",
  HEALTH_INTERVAL_MS: Number(process.env.SORACK_HEALTH_INTERVAL_MS ?? 30_000),
  HEALTH_TIMEOUT_MS: Number(process.env.SORACK_HEALTH_TIMEOUT_MS ?? 5_000),

  // ── runbooks ── file is the source of truth for content, DB is meta cache.
  // Created at startup if absent. Override per deployment (k8s PV mount,
  // docker -v, or local dir bind).
  RUNBOOKS_DIR: process.env.SORACK_RUNBOOKS_DIR ?? "/runbooks",
};

export const DATABASE_URL = `postgres://${env.POSTGRES_USERNAME}:${encodeURIComponent(
  env.POSTGRES_PASSWORD,
)}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`;
