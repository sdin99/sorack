// Runbook CRUD. The file in RUNBOOKS_DIR is the source of truth — these
// handlers write the file via writer.ts; the chokidar watcher then re-syncs
// the DB row. We also upsert directly here so the response can return the
// row without racing the watcher.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../db";
import { runbooks } from "../db/schema";
import { env } from "../lib/env";
import { writeRow } from "../runbooks/writer";
import { defaultMeta, type RunbookRow, type RunbookMeta } from "../runbooks/loader";
import { TEMPLATES } from "../runbooks/templates";

export const runbooksRoutes = new Hono();

runbooksRoutes.get("/", async (c) => {
  const rows = await db.select().from(runbooks);
  return c.json(rows);
});

// Must be registered before `/:id` — otherwise the path-param route would
// claim `_templates` as a runbook id.
runbooksRoutes.get("/_templates", (c) => c.json(TEMPLATES));

runbooksRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(runbooks).where(eq(runbooks.id, id));
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

async function uniqueId(base: string): Promise<string> {
  let id = base;
  let n = 1;
  while (true) {
    const rows = await db.select({ id: runbooks.id }).from(runbooks).where(eq(runbooks.id, id)).limit(1);
    if (rows.length === 0) return id;
    n += 1;
    id = `${base}-${n}`;
  }
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

// Merge any patch-supplied meta keys over the current row's meta, preserving
// the rest. Used by both POST (cur = defaults) and PATCH (cur = existing).
function mergeMeta(cur: RunbookMeta, patch: Partial<RunbookMeta> | undefined): RunbookMeta {
  if (!patch) return cur;
  return { ...cur, ...patch };
}

runbooksRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Partial<RunbookRow>;
  if (!body.title || typeof body.title !== "string") {
    return c.json({ error: "title required" }, 400);
  }
  const id = await uniqueId(slugify(body.title));
  const row: RunbookRow = {
    id,
    title: body.title.trim(),
    category: (body.category ?? "task") as RunbookRow["category"],
    status: (body.status ?? "planned") as RunbookRow["status"],
    summary: typeof body.summary === "string" ? body.summary : "",
    markdown: typeof body.markdown === "string" ? body.markdown : "",
    nodeRefs: Array.isArray(body.nodeRefs) ? body.nodeRefs.filter((v) => typeof v === "string") : [],
    meta: mergeMeta(defaultMeta(), body.meta as Partial<RunbookMeta> | undefined),
  };
  await writeRow(env.RUNBOOKS_DIR, row);
  await db.insert(runbooks).values(row).onConflictDoNothing();
  return c.json(row, 201);
});

runbooksRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "bad id" }, 400);
  const [cur] = await db.select().from(runbooks).where(eq(runbooks.id, id));
  if (!cur) return c.json({ error: "not found" }, 404);
  const patch = await c.req.json().catch(() => ({})) as Partial<RunbookRow>;
  const curMeta = (cur.meta as RunbookMeta) ?? defaultMeta();
  const next: RunbookRow = {
    id: cur.id,
    title: typeof patch.title === "string" ? patch.title.trim() : cur.title,
    category: (typeof patch.category === "string" ? patch.category : cur.category) as RunbookRow["category"],
    status: (typeof patch.status === "string" ? patch.status : cur.status) as RunbookRow["status"],
    summary: typeof patch.summary === "string" ? patch.summary : cur.summary,
    markdown: typeof patch.markdown === "string" ? patch.markdown : cur.markdown,
    nodeRefs: Array.isArray(patch.nodeRefs)
      ? patch.nodeRefs.filter((v) => typeof v === "string")
      : (cur.nodeRefs as string[]),
    meta: mergeMeta(curMeta, patch.meta as Partial<RunbookMeta> | undefined),
  };
  await writeRow(env.RUNBOOKS_DIR, next);
  await db.update(runbooks).set({ ...next, updatedAt: new Date() }).where(eq(runbooks.id, id));
  return c.json(next);
});

runbooksRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "bad id" }, 400);
  const filePath = path.join(env.RUNBOOKS_DIR, `${id}.md`);
  await unlink(filePath).catch(() => undefined);
  await db.delete(runbooks).where(eq(runbooks.id, id));
  return c.body(null, 204);
});
