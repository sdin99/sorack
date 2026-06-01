// File ↔ DB sync. Two phases:
//   1. initialScan() — on boot, scan RUNBOOKS_DIR and reconcile DB rows
//      (upsert every file, delete rows whose files have disappeared).
//   2. startWatcher() — chokidar reacts to add/change/unlink at runtime so
//      external edits (vim, AI agents, git pull) flow into DB automatically.
//
// API writes go through writer.ts which triggers the watcher too — the row
// upsert happens twice but it's idempotent. Avoids two write paths to DB.

import { readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { eq, notInArray } from "drizzle-orm";
import { db } from "../db";
import { runbooks } from "../db/schema";
import { env } from "../lib/env";
import { loadFile, idFromPath, defaultMeta, type RunbookRow, type RunbookMeta } from "./loader";
import { writeRow, pathForId } from "./writer";

let watcher: FSWatcher | null = null;

async function upsertRow(row: RunbookRow): Promise<void> {
  await db
    .insert(runbooks)
    .values({
      id: row.id,
      title: row.title,
      category: row.category,
      status: row.status,
      summary: row.summary,
      markdown: row.markdown,
      nodeRefs: row.nodeRefs,
      meta: row.meta,
    })
    .onConflictDoUpdate({
      target: runbooks.id,
      set: {
        title: row.title,
        category: row.category,
        status: row.status,
        summary: row.summary,
        markdown: row.markdown,
        nodeRefs: row.nodeRefs,
        meta: row.meta,
        updatedAt: new Date(),
      },
    });
}

async function loadAndUpsert(filePath: string): Promise<void> {
  try {
    const row = await loadFile(filePath);
    await upsertRow(row);
  } catch (e) {
    console.warn(`[runbooks] failed to sync ${filePath}:`, (e as Error).message);
  }
}

async function deleteById(id: string): Promise<void> {
  await db.delete(runbooks).where(eq(runbooks.id, id));
}

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

export async function initialScan(): Promise<void> {
  const dir = env.RUNBOOKS_DIR;
  await mkdir(dir, { recursive: true });

  // Migration step: any DB row without a file on disk gets exported to a
  // .md file. Covers two cases: the seed welcome runbook on first boot, and
  // upgrade from DB-only storage (every existing row materializes as a file).
  // After this step, every DB row corresponds 1:1 to a file, and the orphan
  // delete below becomes harmless.
  const dbRows = await db.select().from(runbooks);
  let migrated = 0;
  for (const r of dbRows) {
    if (await fileExists(pathForId(dir, r.id))) continue;
    try {
      const meta: RunbookMeta = { ...defaultMeta(), ...((r.meta ?? {}) as Record<string, unknown>) };
      await writeRow(dir, {
        id: r.id, title: r.title, category: r.category, status: r.status,
        summary: r.summary ?? "",
        markdown: r.markdown, nodeRefs: (r.nodeRefs as string[]) ?? [],
        meta,
      });
      migrated += 1;
    } catch (e) {
      console.warn(`[runbooks] migration write failed for ${r.id}:`, (e as Error).message);
    }
  }
  if (migrated > 0) console.log(`[runbooks] migrated ${migrated} DB row(s) to .md files`);

  const entries = await readdir(dir);
  const mdFiles = entries.filter((f) => f.endsWith(".md") && !f.startsWith("."));
  const ids: string[] = [];
  for (const f of mdFiles) {
    const filePath = path.join(dir, f);
    await loadAndUpsert(filePath);
    ids.push(idFromPath(filePath));
  }
  // Drop DB rows whose files are gone. After the migration above this only
  // happens if the operator deleted a .md between sessions.
  const keep = ids.length > 0 ? ids : ["__none__"];
  await db.delete(runbooks).where(notInArray(runbooks.id, keep));
  console.log(`[runbooks] initial scan: ${mdFiles.length} file(s) in ${dir}`);
}

export function startWatcher(): void {
  if (watcher) return;
  const dir = env.RUNBOOKS_DIR;
  watcher = chokidar.watch(dir, {
    ignored: (p) => path.basename(p).startsWith(".") || p.endsWith(".tmp"),
    ignoreInitial: true,
    persistent: true,
    depth: 0,
  });
  watcher.on("add", (p) => p.endsWith(".md") && loadAndUpsert(p));
  watcher.on("change", (p) => p.endsWith(".md") && loadAndUpsert(p));
  watcher.on("unlink", (p) => {
    if (p.endsWith(".md")) deleteById(idFromPath(p));
  });
  watcher.on("error", (e) => console.warn("[runbooks] watcher error:", e));
  console.log(`[runbooks] watching ${dir}`);
}

export async function stopWatcher(): Promise<void> {
  if (!watcher) return;
  await watcher.close();
  watcher = null;
}
