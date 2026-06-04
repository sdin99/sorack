// Reads a runbook .md file from disk, parses YAML frontmatter, and returns a
// shape suitable for upsert into docs.runbooks. The file is authoritative —
// the row in DB is a denormalized cache for fast list/search/joins.
//
// Frontmatter is optional. A bare .md with no frontmatter still imports with
// sensible defaults (title from filename, category=task, status=planned) so
// the "drop in an AI-written .md" workflow works without ceremony.
//
// Frontmatter schema v1:
//   title         string   (required-ish; falls back to filename)
//   category      enum     (task | sop | incident | postmortem | design_doc)
//   status        enum     (planned | in_progress | completed | rolled_back)
//   summary       string   (one-liner shown in list views)
//   tags          string[] (free labels for filter/search)
//   nodeRefs      string[] (referenced node ids)
//   runbookRefs   string[] (related runbook ids)
//   severity      string   (free; recommended: info | warning | critical)
//   author        string   (free; multi-user backfills later)
//   template      object|null  { source, id, version, derivedAt }
//   schema        number   frontmatter schema version (defaults to 1)
//
// Unknown keys are preserved on the file but not surfaced in the row — they
// pass through future round-trips unchanged.

import { readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type RunbookCategory = "task" | "sop" | "incident" | "postmortem" | "design_doc";
export type RunbookStatus = "planned" | "in_progress" | "completed" | "rolled_back";

export interface TemplateRef {
  source: string;
  id: string;
  version: string;
  derivedAt: string;
}

// Known frontmatter keys are typed. The index signature lets us pass
// unknown keys through round-trips without dropping them — templates and
// future extensions can stash custom data here without a schema migration.
export interface RunbookMeta {
  tags: string[];
  runbookRefs: string[];
  severity: string;
  author: string;
  template: TemplateRef | null;
  schema: number;
  [extra: string]: unknown;
}

export interface RunbookRow {
  id: string;
  title: string;
  category: RunbookCategory;
  status: RunbookStatus;
  summary: string;
  markdown: string;
  nodeRefs: string[];
  meta: RunbookMeta;
}

const VALID_CATEGORY = new Set<RunbookCategory>([
  "task", "sop", "incident", "postmortem", "design_doc",
]);
const VALID_STATUS = new Set<RunbookStatus>([
  "planned", "in_progress", "completed", "rolled_back",
]);

export function defaultMeta(): RunbookMeta {
  return { tags: [], runbookRefs: [], severity: "", author: "", template: null, schema: 1 };
}

// Derive id from filename (without extension). Caller is responsible for
// passing a path inside RUNBOOKS_DIR; we don't validate location here.
export function idFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

// YAML auto-parses ISO 8601 timestamps into Date objects; we want the string
// form on the row so the JSON payload + DB cache stay primitive.
function coerceStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return "";
}
function parseTemplate(v: unknown): TemplateRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    source: coerceStr(o.source),
    id: coerceStr(o.id),
    version: coerceStr(o.version),
    derivedAt: coerceStr(o.derivedAt),
  };
}

// Parse a file into a row. Throws on malformed YAML; caller decides what to
// do (sync skips that file with a warning).
export async function loadFile(filePath: string): Promise<RunbookRow> {
  const raw = await readFile(filePath, "utf8");
  const fm = matter(raw);
  const data = fm.data as Record<string, unknown>;
  const id = idFromPath(filePath);

  const titleRaw = typeof data.title === "string" && data.title.trim() ? data.title.trim() : id;
  // Hyphens were the convention I used in early drafts; underscores are the
  // SQL enum. Normalize "design-doc" → "design_doc" so AI-authored files
  // with either spelling load without surprise.
  const catRawStr = typeof data.category === "string" ? data.category.replace(/-/g, "_") : "task";
  const catRaw = catRawStr as RunbookCategory;
  const stRaw = (typeof data.status === "string" ? data.status : "planned") as RunbookStatus;
  // Spread the full frontmatter blob so unknown keys ride along, then
  // override known keys with normalized values. Row-level keys (title,
  // category, ...) get pulled out so they live at the row level only.
  const meta: RunbookMeta = {
    ...data,
    tags: strArr(data.tags),
    runbookRefs: strArr(data.runbookRefs),
    severity: typeof data.severity === "string" ? data.severity : "",
    author: typeof data.author === "string" ? data.author : "",
    template: parseTemplate(data.template),
    schema: typeof data.schema === "number" ? data.schema : 1,
  };
  for (const k of ["title", "category", "status", "summary", "nodeRefs"]) delete (meta as Record<string, unknown>)[k];

  return {
    id,
    title: titleRaw,
    category: VALID_CATEGORY.has(catRaw) ? catRaw : "task",
    status: VALID_STATUS.has(stRaw) ? stRaw : "planned",
    summary: typeof data.summary === "string" ? data.summary : "",
    // Strip exactly ONE trailing newline — the one gray-matter's stringify
    // always appends — so save→read→save is idempotent without eating the
    // user's own trailing blank lines. The earlier `/^\n+|\n+$/g` wiped
    // every leading and trailing newline, which silently ate any paragraph
    // spacing the user typed at the end of the buffer.
    markdown: fm.content.replace(/\n$/, ""),
    nodeRefs: strArr(data.nodeRefs),
    meta,
  };
}
