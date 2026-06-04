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

// Emit known fields, strip default/empty values, and pass unknown keys
// (collected by the loader via RunbookMeta's index signature) through
// untouched so templates / future plugins can stash custom frontmatter.
// `schema` is always emitted so the file is self-describing.
function buildFrontmatter(row: RunbookRow): Record<string, unknown> {
  // Start with the full meta blob (preserves unknown keys), then layer
  // known fields and row-level fields, stripping empty defaults at the end.
  const fm: Record<string, unknown> = { ...row.meta };
  fm.schema = row.meta.schema || 1;
  if (row.title && row.title !== row.id) fm.title = row.title;
  if (row.category !== "task") fm.category = row.category;
  if (row.status !== "planned") fm.status = row.status;
  if (row.summary) fm.summary = row.summary;
  if (row.nodeRefs.length > 0) fm.nodeRefs = row.nodeRefs;
  // Strip empty/default known meta keys so the file stays tidy.
  if (!Array.isArray(fm.tags) || (fm.tags as string[]).length === 0) delete fm.tags;
  if (!Array.isArray(fm.runbookRefs) || (fm.runbookRefs as string[]).length === 0) delete fm.runbookRefs;
  if (!fm.severity) delete fm.severity;
  if (!fm.author) delete fm.author;
  if (!fm.template) delete fm.template;
  return fm;
}

export async function writeRow(dir: string, row: RunbookRow): Promise<string> {
  await mkdir(dir, { recursive: true });
  const target = pathForId(dir, row.id);
  const fm = buildFrontmatter(row);
  // Append one \n before stringify so gray-matter's "add a \n if absent /
  // leave alone if present" rule turns into "always add exactly one extra
  // \n". The loader strips exactly one trailing \n, so user trailing blank
  // lines round-trip 1:1 instead of getting silently eaten by the writer's
  // single-\n cap.
  const body = matter.stringify(row.markdown + "\n", fm);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, target);
  return target;
}
