// File attachments per runbook. Lives next to the .md file as
// `<RUNBOOKS_DIR>/<runbookId>/<filename>` so a runbook + its
// screenshots / PDFs travel together in the git repo and the markdown
// can reference `./<id>/<name>` relatively.
//
// Safety:
//   - filename must be a single path segment (no `/`, `\`, `..`, no
//     leading `.`) so a crafted upload can't escape the dir
//   - size limit enforced at the route, not here, so this module stays
//     pure file ops
//   - uniqueName() resolves collisions by appending `-1`, `-2`, … to
//     the basename, keeping the extension and the human-readable name

import { readFile, readdir, writeFile, unlink, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "../lib/env";

const SAFE_NAME = /^[^/\\]+$/; // anything but path separators

export class AttachmentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function attachmentsDir(runbookId: string): string {
  if (!SAFE_NAME.test(runbookId) || runbookId.startsWith(".") || runbookId.includes("..")) {
    throw new AttachmentError("invalid runbook id", 400);
  }
  return path.join(env.RUNBOOKS_DIR, runbookId);
}

function safeJoin(runbookId: string, filename: string): string {
  if (!SAFE_NAME.test(filename) || filename.startsWith(".") || filename.includes("..")) {
    throw new AttachmentError("invalid filename", 400);
  }
  return path.join(attachmentsDir(runbookId), filename);
}

// Pick a non-colliding filename. Tries `name.ext`, then `name-1.ext`,
// up to a sane limit before giving up.
export async function uniqueName(runbookId: string, requested: string): Promise<string> {
  if (!SAFE_NAME.test(requested) || requested.startsWith(".") || requested.includes("..")) {
    throw new AttachmentError("invalid filename", 400);
  }
  const dir = attachmentsDir(runbookId);
  let names: string[] = [];
  try { names = await readdir(dir); } catch { /* dir doesn't exist yet → no collisions */ }
  if (!names.includes(requested)) return requested;
  const dot = requested.lastIndexOf(".");
  const base = dot > 0 ? requested.slice(0, dot) : requested;
  const ext = dot > 0 ? requested.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const cand = `${base}-${i}${ext}`;
    if (!names.includes(cand)) return cand;
  }
  throw new AttachmentError("too many collisions", 500);
}

export async function writeAttachment(runbookId: string, filename: string, data: Buffer): Promise<void> {
  const target = safeJoin(runbookId, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

export async function readAttachment(runbookId: string, filename: string): Promise<{ body: Buffer; size: number }> {
  const target = safeJoin(runbookId, filename);
  try {
    const [body, info] = await Promise.all([readFile(target), stat(target)]);
    return { body, size: info.size };
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new AttachmentError("not found", 404);
    throw e;
  }
}

export async function deleteAttachment(runbookId: string, filename: string): Promise<void> {
  const target = safeJoin(runbookId, filename);
  try { await unlink(target); }
  catch (e: any) {
    if (e?.code === "ENOENT") throw new AttachmentError("not found", 404);
    throw e;
  }
}

export async function listAttachments(runbookId: string): Promise<string[]> {
  const dir = attachmentsDir(runbookId);
  try { return (await readdir(dir)).filter((n) => !n.startsWith(".")).sort(); }
  catch { return []; }
}

// Best-effort content type from extension. Generic fallback so we never
// refuse to serve a stored file just because we don't recognise it.
const MIME: Record<string, string> = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".pdf":  "application/pdf",
  ".txt":  "text/plain; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".yaml": "application/yaml",
  ".yml":  "application/yaml",
  ".csv":  "text/csv; charset=utf-8",
  ".log":  "text/plain; charset=utf-8",
  ".zip":  "application/zip",
};
export function contentTypeForName(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}
