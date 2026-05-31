// Writes a runbook row back to disk: YAML frontmatter + markdown body.
// Atomic-ish: write to a temp file then rename so a partial write never
// leaves a half-broken .md in the dir (the watcher would re-parse and barf).

import { writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { RunbookRow } from "./loader";

export function pathForId(dir: string, id: string): string {
  return path.join(dir, `${id}.md`);
}

// Only persist non-default frontmatter keys to keep .md files clean. A bare
// runbook with the defaults has an empty frontmatter block.
function buildFrontmatter(row: RunbookRow): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  if (row.title && row.title !== row.id) fm.title = row.title;
  if (row.category !== "task") fm.category = row.category;
  if (row.status !== "planned") fm.status = row.status;
  if (row.nodeRefs.length > 0) fm.nodeRefs = row.nodeRefs;
  return fm;
}

export async function writeRow(dir: string, row: RunbookRow): Promise<string> {
  await mkdir(dir, { recursive: true });
  const target = pathForId(dir, row.id);
  const fm = buildFrontmatter(row);
  const body = matter.stringify(row.markdown, fm);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, target);
  return target;
}
