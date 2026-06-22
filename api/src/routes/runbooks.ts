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
import { withLock, treeLockKey } from "../lib/locks";

// Working-tree gate shared with GitClient (see lib/locks.ts for the lock
// ordering contract). Every file write below takes runbook:<id> first, then
// this — so a save can't land inside pull's dirty-check → force-checkout
// window.
const TREE = () => treeLockKey(env.RUNBOOKS_DIR);
import { writeRow } from "../runbooks/writer";
import { defaultMeta, type RunbookRow, type RunbookMeta } from "../runbooks/loader";
import { TEMPLATES } from "../runbooks/templates";
import {
  AttachmentError,
  contentTypeForName,
  deleteAttachment,
  listAttachments,
  readAttachment,
  uniqueName,
  writeAttachment,
} from "../runbooks/attachments";

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export const runbooksRoutes = new Hono();

runbooksRoutes.get("/", async (c) => {
  const rows = await db.select().from(runbooks);
  return c.json(rows);
});

// Must be registered before `/:id` — otherwise the path-param route would
// claim `_templates` as a runbook id.
runbooksRoutes.get("/_templates", (c) => c.json(TEMPLATES));

// ── Attachments ───────────────────────────────────────────────────────
// Files stored next to the .md (`RUNBOOKS_DIR/<id>/<name>`) so a
// runbook + its attachments travel together in the git repo. Path
// segments are validated in attachments.ts; routes only enforce size.
runbooksRoutes.get("/:id/attachments", async (c) => {
  try {
    const names = await listAttachments(c.req.param("id"));
    return c.json({ files: names });
  } catch (e) {
    if (e instanceof AttachmentError) return c.json({ error: e.message }, e.status as any);
    throw e;
  }
});

runbooksRoutes.post("/:id/attachments", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const raw = body["file"];
  const file = Array.isArray(raw) ? raw[0] : raw;
  if (!(file instanceof File)) return c.json({ error: "file field required" }, 400);
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: `file too large (>${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB)` }, 413);
  }
  try {
    // Honor the user's filename when we can; fall back if the browser
    // didn't supply one (e.g. paste from clipboard yields "image.png").
    const requested = file.name && file.name.length > 0 ? file.name : "file";
    const buf = Buffer.from(await file.arrayBuffer());
    // uniqueName + write under the tree lock: serializing the pair also
    // stops two same-named concurrent uploads (clipboard pastes are always
    // "image.png") from both picking the same free name and overwriting
    // each other.
    return await withLock(TREE(), async () => {
      const filename = await uniqueName(id, requested);
      await writeAttachment(id, filename, buf);
      return c.json({
        filename,
        url: `/api/runbooks/${encodeURIComponent(id)}/attachments/${encodeURIComponent(filename)}`,
        size: buf.length,
        contentType: file.type || contentTypeForName(filename),
      });
    });
  } catch (e) {
    if (e instanceof AttachmentError) return c.json({ error: e.message }, e.status as any);
    throw e;
  }
});

runbooksRoutes.get("/:id/attachments/:name", async (c) => {
  try {
    const { body, size } = await readAttachment(c.req.param("id"), c.req.param("name"));
    // Hono's c.body wants a Uint8Array backed by a fresh ArrayBuffer (not
    // ArrayBufferLike, which would also admit SharedArrayBuffer). Copy
    // into a clean buffer so the type matches and the request can't
    // accidentally hold a reference to Node's pooled Buffer slab.
    const ab = new ArrayBuffer(body.byteLength);
    new Uint8Array(ab).set(body);
    return c.body(new Uint8Array(ab), 200, {
      "content-type": contentTypeForName(c.req.param("name")),
      "content-length": String(size),
      // Inline so images render in the preview; the browser still lets
      // the user "save as" via the link's context menu.
      "content-disposition": "inline",
      // Without an explicit cache directive browsers treat the response
      // as non-cacheable, so every re-render of the markdown preview
      // re-downloads the file → visible flicker on each keystroke. A
      // minute is long enough to kill the flicker and short enough that
      // a deleted+re-uploaded attachment with the same name (rare)
      // refreshes promptly.
      "cache-control": "private, max-age=60",
    });
  } catch (e) {
    if (e instanceof AttachmentError) return c.json({ error: e.message }, e.status as any);
    throw e;
  }
});

runbooksRoutes.delete("/:id/attachments/:name", async (c) => {
  try {
    await withLock(TREE(), () => deleteAttachment(c.req.param("id"), c.req.param("name")));
    return c.json({ ok: true });
  } catch (e) {
    if (e instanceof AttachmentError) return c.json({ error: e.message }, e.status as any);
    throw e;
  }
});

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
  return withLock(`runbook:${id}`, () => withLock(TREE(), async () => {
    await writeRow(env.RUNBOOKS_DIR, row);
    await db.insert(runbooks).values(row).onConflictDoNothing();
    return c.json(row, 201);
  }));
});

runbooksRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "bad id" }, 400);
  // Parse the body before taking the lock — don't hold it through a slow
  // client upload. The select must sit INSIDE the lock: two concurrent
  // PATCHes ({markdown} and {status}) that both read the same stale row
  // would otherwise each write a full document that reverts the other's
  // field (lost update).
  const patch = await c.req.json().catch(() => ({})) as Partial<RunbookRow>;
  return withLock(`runbook:${id}`, () => withLock(TREE(), async () => {
    const [cur] = await db.select().from(runbooks).where(eq(runbooks.id, id));
    if (!cur) return c.json({ error: "not found" }, 404);
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
  }));
});

runbooksRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return c.json({ error: "bad id" }, 400);
  return withLock(`runbook:${id}`, () => withLock(TREE(), async () => {
    const filePath = path.join(env.RUNBOOKS_DIR, `${id}.md`);
    await unlink(filePath).catch(() => undefined);
    await db.delete(runbooks).where(eq(runbooks.id, id));
    return c.body(null, 204);
  }));
});
