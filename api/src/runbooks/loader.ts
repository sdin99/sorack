// Reads a runbook .md file from disk, parses YAML frontmatter, and returns a
// shape suitable for upsert into docs.runbooks. The file is authoritative —
// the row in DB is a denormalized cache for fast list/search/joins.
//
// Frontmatter is optional. A bare .md with no frontmatter still imports with
// sensible defaults (title from filename, category=task, status=planned) so
// the "drop in an AI-written .md" workflow works without ceremony.

import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface RunbookRow {
  id: string;
  title: string;
  category: "task" | "sop";
  status: "planned" | "in_progress" | "completed" | "rolled_back";
  markdown: string;
  nodeRefs: string[];
}

const VALID_CATEGORY = new Set<RunbookRow["category"]>(["task", "sop"]);
const VALID_STATUS = new Set<RunbookRow["status"]>([
  "planned", "in_progress", "completed", "rolled_back",
]);

// Derive id from filename (without extension). Caller is responsible for
// passing a path inside RUNBOOKS_DIR; we don't validate location here.
export function idFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

// Parse a file into a row. Throws on malformed YAML; caller decides what to
// do (sync skips that file with a warning).
export async function loadFile(filePath: string): Promise<RunbookRow> {
  const raw = await readFile(filePath, "utf8");
  const fm = matter(raw);
  const data = fm.data as Record<string, unknown>;
  const id = idFromPath(filePath);

  const titleRaw = typeof data.title === "string" && data.title.trim() ? data.title.trim() : id;
  const catRaw = typeof data.category === "string" ? data.category as RunbookRow["category"] : "task";
  const stRaw = typeof data.status === "string" ? data.status as RunbookRow["status"] : "planned";
  const refsRaw = Array.isArray(data.nodeRefs)
    ? data.nodeRefs.filter((v) => typeof v === "string")
    : [];

  return {
    id,
    title: titleRaw,
    category: VALID_CATEGORY.has(catRaw) ? catRaw : "task",
    status: VALID_STATUS.has(stRaw) ? stRaw : "planned",
    markdown: fm.content.replace(/^\n+/, ""),
    nodeRefs: refsRaw,
  };
}
