// Request-body validation for the write endpoints.
//
// Why by hand rather than zod: the surface is two resources, and the thing
// that actually matters here is the error text. A script is the caller now,
// and a script cannot tell "my request was wrong" from "the server broke"
// unless the first is a 400 that names the field. Previously every route did
// `db.insert(...).values(body)` with the parsed JSON, so a bad request became
// a Postgres error surfaced as a 500 — and a client with retry logic will
// send that same bad request again, forever.
//
// If this grows much past node/edge, or once api and web share schemas,
// swap it for a schema library. It is deliberately small, not principled.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const NODE_ID = /^[a-z0-9][a-z0-9/_-]{0,127}$/;
const STATUSES = ["ok", "warn", "err", "unknown"] as const;

function str(v: unknown, field: string, max: number, { required = true } = {}): string | undefined {
  if (v === undefined || v === null) {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new ValidationError(`${field} must be a string`);
  const t = v.trim();
  if (required && !t) throw new ValidationError(`${field} must not be empty`);
  if (t.length > max) throw new ValidationError(`${field} must be ${max} characters or fewer`);
  return t;
}

function plainObject(v: unknown, field: string): Record<string, unknown> | undefined {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new ValidationError(
      field === "body" ? "body must be a JSON object" : `${field} must be an object`,
    );
  }
  return v as Record<string, unknown>;
}

function stringArray(v: unknown, field: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array of strings`);
  for (const item of v) {
    if (typeof item !== "string") throw new ValidationError(`${field} must contain only strings`);
  }
  return v as string[];
}

function position(v: unknown): { x: number; y: number } | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ValidationError("position must be {x, y} or null");
  }
  const { x, y } = v as Record<string, unknown>;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new ValidationError("position.x and position.y must be finite numbers");
  }
  return { x: x as number, y: y as number };
}

export interface NodeInput {
  id?: string;
  type?: string;
  parentId?: string | null;
  name?: string;
  status?: (typeof STATUSES)[number];
  meta?: Record<string, unknown>;
  tags?: string[];
  position?: { x: number; y: number } | null;
}

// `partial` is the PATCH case: absent fields mean "leave alone", so only what
// is present gets checked.
export function validateNode(body: unknown, { partial = false } = {}): NodeInput {
  const b = plainObject(body, "body");
  if (!b) throw new ValidationError("body must be a JSON object");

  const out: NodeInput = {};

  if (!partial || b.id !== undefined) {
    const id = str(b.id, "id", 128);
    // Same shape as everywhere else an id is accepted: it ends up in URLs
    // and in `[[node:...]]` references, so it cannot carry spaces or case.
    if (id && !NODE_ID.test(id)) {
      throw new ValidationError(
        "id must be lowercase letters, digits, '-', '_' or '/', starting with a letter or digit",
      );
    }
    out.id = id;
  }
  if (!partial || b.type !== undefined) out.type = str(b.type, "type", 64);
  if (!partial || b.name !== undefined) out.name = str(b.name, "name", 256);

  if (b.parentId !== undefined) {
    out.parentId = b.parentId === null ? null : (str(b.parentId, "parentId", 128) as string);
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as never)) {
      throw new ValidationError(`status must be one of: ${STATUSES.join(", ")}`);
    }
    out.status = b.status as NodeInput["status"];
  }
  if (b.meta !== undefined) out.meta = plainObject(b.meta, "meta");
  if (b.tags !== undefined) out.tags = stringArray(b.tags, "tags");
  if (b.position !== undefined) out.position = position(b.position);

  if (partial && Object.keys(out).length === 0) {
    throw new ValidationError("no known fields to update");
  }
  return out;
}

export interface EdgeInput {
  sourceId?: string;
  targetId?: string;
  type?: string;
  meta?: Record<string, unknown>;
}

export function validateEdge(body: unknown, { partial = false } = {}): EdgeInput {
  const b = plainObject(body, "body");
  if (!b) throw new ValidationError("body must be a JSON object");

  const out: EdgeInput = {};
  if (!partial || b.sourceId !== undefined) out.sourceId = str(b.sourceId, "sourceId", 128);
  if (!partial || b.targetId !== undefined) out.targetId = str(b.targetId, "targetId", 128);
  if (b.type !== undefined) out.type = str(b.type, "type", 64);
  if (b.meta !== undefined) out.meta = plainObject(b.meta, "meta");

  if (out.sourceId && out.targetId && out.sourceId === out.targetId) {
    throw new ValidationError("sourceId and targetId must differ");
  }
  if (partial && Object.keys(out).length === 0) {
    throw new ValidationError("no known fields to update");
  }
  return out;
}
