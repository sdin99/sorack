// Git operations exposed to the UI: status (for the topbar badge),
// config get/set (for the Settings panel), and the two write actions
// (pull = fetch + ff-merge, commit-push = stage all + commit + push).
//
// All write actions return a structured `{ok, ...}` payload instead of
// throwing on known failures (non-ff, nothing to commit, auth errors) so
// the UI can render them as in-place messages rather than generic 500s.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { gitConfig } from "../db/schema";
import { getGitClient } from "../git/runtime";
import { getConfigSource, isGitEnabled, loadGitConfig, saveGitConfig, type SaveablePatch } from "../git/config";
import { encryptToken } from "../git/crypto";

export const gitRoutes = new Hono();

// Status — cheap enough to call every few seconds; the heavy operations
// (fetch / push) are explicit user actions, not status side-effects.
gitRoutes.get("/status", async (c) => {
  const client = await getGitClient();
  const status = await client.status();
  // `configured` already encodes "git mode is active + remote set"
  // (loadGitConfig returns null otherwise). We add `enabled` so the UI
  // can distinguish "local mode" from "git mode but missing config".
  const enabled = await isGitEnabled();
  return c.json({ ...status, enabled });
});

// Config — UI form values + per-field source ("env" | "db" | null) so
// env-pinned fields render read-only. Token itself is never returned;
// the UI shows a "(set)" placeholder when source !== null.
gitRoutes.get("/config", async (c) => {
  // We read the DB row directly so the form shows the user's stored
  // values even when storage mode is currently "local" (loadGitConfig
  // returns null in that case).
  const [row] = await db.select().from(gitConfig).where(eq(gitConfig.id, 1)).limit(1);
  const enabled = await isGitEnabled();
  const source = await getConfigSource();
  return c.json({
    enabled,
    remote: row?.remote ?? process.env.SORACK_GIT_REMOTE ?? "",
    branch: row?.branch ?? process.env.SORACK_GIT_BRANCH ?? "main",
    username: row?.username ?? process.env.SORACK_GIT_USERNAME ?? "",
    authorName: row?.authorName ?? process.env.SORACK_GIT_AUTHOR_NAME ?? "",
    authorEmail: row?.authorEmail ?? process.env.SORACK_GIT_AUTHOR_EMAIL ?? "",
    tokenSet: Boolean(row?.token || process.env.SORACK_GIT_TOKEN),
    source,
  });
});

// Update DB-backed config values. Env-pinned fields are silently ignored
// (the UI already greys those out, but we double-check server-side).
gitRoutes.patch("/config", async (c) => {
  const body = (await c.req.json()) as SaveablePatch;
  const source = await getConfigSource();
  const safe: SaveablePatch = {};
  if (body.enabled !== undefined && source.enabled !== "env") safe.enabled = body.enabled;
  if (body.remote !== undefined && source.remote !== "env") safe.remote = body.remote;
  if (body.branch !== undefined && source.branch !== "env") safe.branch = body.branch;
  if (body.username !== undefined && source.username !== "env") safe.username = body.username;
  if (body.token !== undefined && source.token !== "env") {
    // Empty string clears the stored token; any non-empty value is
    // encrypted at rest with the master key (env.GIT_TOKEN_KEY).
    safe.token = body.token ? encryptToken(body.token) : null;
  }
  if (body.authorName !== undefined && source.authorName !== "env") safe.authorName = body.authorName;
  if (body.authorEmail !== undefined && source.authorEmail !== "env") safe.authorEmail = body.authorEmail;
  await saveGitConfig(safe);
  // Refresh the live client's config so a subsequent action uses the new
  // values without waiting for the next background tick.
  const client = await getGitClient();
  client.setConfig(await loadGitConfig());
  return c.json({ ok: true });
});

gitRoutes.post("/pull", async (c) => {
  const client = await getGitClient();
  if (!client.cfg) return c.json({ ok: false, reason: "not configured" }, 412);
  try {
    const r = await client.pull();
    return c.json(r);
  } catch (e) {
    return c.json({ ok: false, reason: String((e as Error)?.message ?? e) }, 500);
  }
});

gitRoutes.post("/commit-push", async (c) => {
  const client = await getGitClient();
  if (!client.cfg) return c.json({ ok: false, reason: "not configured" }, 412);
  const body = (await c.req.json()) as { message?: string };
  const message = (body.message ?? "").trim();
  if (!message) return c.json({ ok: false, reason: "message required" }, 400);
  try {
    const r = await client.commitAndPush(message);
    return c.json(r);
  } catch (e) {
    return c.json({ ok: false, reason: String((e as Error)?.message ?? e) }, 500);
  }
});
