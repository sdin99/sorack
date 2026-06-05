// Git operations exposed to the UI: status (for the topbar badge),
// config get/set (for the Settings panel), and the two write actions
// (pull = fetch + ff-merge, commit-push = stage all + commit + push).
//
// All write actions return a structured `{ok, ...}` payload instead of
// throwing on known failures (non-ff, nothing to commit, auth errors) so
// the UI can render them as in-place messages rather than generic 500s.

import { Hono } from "hono";
import { getGitClient } from "../git/runtime";
import { getConfigSource, loadGitConfig, saveGitConfig, type SaveablePatch } from "../git/config";

export const gitRoutes = new Hono();

// Status — cheap enough to call every few seconds; the heavy operations
// (fetch / push) are explicit user actions, not status side-effects.
gitRoutes.get("/status", async (c) => {
  const client = await getGitClient();
  const status = await client.status();
  return c.json(status);
});

// Config — UI form values + per-field source ("env" | "db" | null) so
// env-pinned fields render read-only. Token itself is never returned;
// the UI shows a "(set)" placeholder when source !== null.
gitRoutes.get("/config", async (c) => {
  const cfg = await loadGitConfig();
  const source = await getConfigSource();
  return c.json({
    remote: cfg?.remote ?? "",
    branch: cfg?.branch ?? "main",
    username: cfg?.username ?? "",
    authorName: cfg?.authorName ?? "",
    authorEmail: cfg?.authorEmail ?? "",
    tokenSet: Boolean(cfg?.token),
    source,
  });
});

// Update DB-backed config values. Env-pinned fields are silently ignored
// (the UI already greys those out, but we double-check server-side).
gitRoutes.patch("/config", async (c) => {
  const body = (await c.req.json()) as SaveablePatch;
  const source = await getConfigSource();
  const safe: SaveablePatch = {};
  if (body.remote !== undefined && source.remote !== "env") safe.remote = body.remote;
  if (body.branch !== undefined && source.branch !== "env") safe.branch = body.branch;
  if (body.username !== undefined && source.username !== "env") safe.username = body.username;
  if (body.token !== undefined && source.token !== "env") safe.token = body.token;
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
