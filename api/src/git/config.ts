// Git config resolution. Env vars (`SORACK_GIT_*`) take precedence over
// the DB row written from the Settings UI — so an operator can pin
// values via k8s secret / Helm values without the UI being able to
// overwrite them, while a public self-hoster can do everything from the
// UI without touching env.
//
// Source-aware (`getConfigSource`) lets the UI render env-pinned fields
// as read-only with a small "(env)" badge so the user understands why
// the input is locked.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { gitConfig } from "../db/schema";
import type { GitConfig } from "./client";
import { decryptToken } from "./crypto";

const ENV = {
  ENABLED: process.env.SORACK_GIT_ENABLED, // string "true" | "false" | undefined
  REMOTE: process.env.SORACK_GIT_REMOTE || undefined,
  BRANCH: process.env.SORACK_GIT_BRANCH || undefined,
  USERNAME: process.env.SORACK_GIT_USERNAME || undefined,
  TOKEN: process.env.SORACK_GIT_TOKEN || undefined,
  AUTHOR_NAME: process.env.SORACK_GIT_AUTHOR_NAME || undefined,
  AUTHOR_EMAIL: process.env.SORACK_GIT_AUTHOR_EMAIL || undefined,
} as const;

interface DbRow {
  enabled: boolean;
  remote: string | null;
  branch: string | null;
  username: string | null;
  token: string | null;
  authorName: string | null;
  authorEmail: string | null;
}

async function readDbRow(): Promise<DbRow | null> {
  const rows = await db.select().from(gitConfig).where(eq(gitConfig.id, 1)).limit(1);
  return rows[0] ?? null;
}

// Returns the effective config the GitClient should use. Returns null
// when storage mode is "local file" (enabled=false) or when no remote
// URL is set anywhere. The caller treats both cases as "git infra
// idle".
export async function loadGitConfig(): Promise<GitConfig | null> {
  if (!(await isGitEnabled())) return null;
  const row = await readDbRow();
  const remote = ENV.REMOTE ?? row?.remote ?? "";
  if (!remote) return null;
  // DB-stored token is encrypted (or legacy plaintext for rows written
  // before the encryption landed). Env-supplied tokens are always raw.
  const dbToken = decryptToken(row?.token ?? null);
  return {
    remote,
    branch: ENV.BRANCH ?? row?.branch ?? "main",
    username: ENV.USERNAME ?? row?.username ?? undefined,
    token: ENV.TOKEN ?? dbToken,
    authorName: ENV.AUTHOR_NAME ?? row?.authorName ?? undefined,
    authorEmail: ENV.AUTHOR_EMAIL ?? row?.authorEmail ?? undefined,
  };
}

// Whether the user (or operator) has flipped storage to "git sync".
// Env overrides the DB toggle so devops can pin a deployment on.
export async function isGitEnabled(): Promise<boolean> {
  if (ENV.ENABLED === "true") return true;
  if (ENV.ENABLED === "false") return false;
  const row = await readDbRow();
  return Boolean(row?.enabled);
}

export type FieldSource = "env" | "db" | null;
export interface ConfigSource {
  enabled: FieldSource;
  remote: FieldSource;
  branch: FieldSource;
  username: FieldSource;
  token: FieldSource;
  authorName: FieldSource;
  authorEmail: FieldSource;
}

// Per-field provenance so the UI can label env-pinned fields read-only.
export async function getConfigSource(): Promise<ConfigSource> {
  const row = await readDbRow();
  function pick(envVal: string | undefined, dbVal: string | null | undefined): FieldSource {
    if (envVal) return "env";
    if (dbVal) return "db";
    return null;
  }
  return {
    enabled:
      ENV.ENABLED === "true" || ENV.ENABLED === "false" ? "env" :
      row?.enabled !== undefined ? "db" : null,
    remote: pick(ENV.REMOTE, row?.remote),
    branch: pick(ENV.BRANCH, row?.branch),
    username: pick(ENV.USERNAME, row?.username),
    token: pick(ENV.TOKEN, row?.token),
    authorName: pick(ENV.AUTHOR_NAME, row?.authorName),
    authorEmail: pick(ENV.AUTHOR_EMAIL, row?.authorEmail),
  };
}

export type SaveablePatch = Partial<{
  enabled: boolean;
  remote: string | null;
  branch: string | null;
  username: string | null;
  token: string | null;
  authorName: string | null;
  authorEmail: string | null;
}>;

// Upserts the UI-supplied values into the single-row table. Fields not in
// the patch are left untouched; fields explicitly set to null clear the
// stored value (the UI uses this to "remove" a token without env
// fallback). Env-pinned fields are silently no-op'd in routes/git.ts.
export async function saveGitConfig(patch: SaveablePatch): Promise<void> {
  const values = { id: 1, ...patch, updatedAt: new Date() };
  await db
    .insert(gitConfig)
    .values(values)
    .onConflictDoUpdate({
      target: gitConfig.id,
      set: { ...patch, updatedAt: new Date() },
    });
}
