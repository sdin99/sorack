// Tables grouped into Postgres schemas so SQL queries (and tooling) show
// the category up-front:
//   - inventory.nodes / inventory.edges          : topology
//   - docs.runbooks                               : documentation
//   - monitoring.alerts                           : events / alerts
//
// New domains add new schemas (audit, system, ...) — table list stays clean.
//
// Notes:
//   - meta jsonb: per-row free-form metadata (specs, IPs, versions, ...)
//   - position jsonb: x/y for React Flow drag-to-position (Phase 3)
//   - parent_id: hierarchy for drill-down (also represented in edges as
//     type='contains' once it matters)

import {
  pgSchema,
  text,
  jsonb,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ── schemas ──────────────────────────────────────────────────────────

export const inventory = pgSchema("inventory");
export const docs = pgSchema("docs");
export const monitoring = pgSchema("monitoring");
export const auth = pgSchema("auth");

// ── enums (live in their owning schema) ──────────────────────────────

export const statusEnum = inventory.enum("status", [
  "ok",
  "warn",
  "err",
  "unknown",
]);

export const runbookCategoryEnum = docs.enum("runbook_category", [
  "task",
  "sop",
  "incident",
  "postmortem",
  "design_doc",
]);
export const runbookStatusEnum = docs.enum("runbook_status", [
  "planned",
  "in_progress",
  "completed",
  "rolled_back",
]);

export const alertSeverityEnum = monitoring.enum("alert_severity", [
  "ok",
  "warn",
  "err",
]);

// ── inventory.nodes ──────────────────────────────────────────────────

export const nodes = inventory.table("nodes", {
  id: varchar("id", { length: 128 }).primaryKey(),
  // node kind — router/host/vm/container/k8s_cluster/k8s_namespace/k8s_service/k8s_pvc/...
  type: varchar("type", { length: 64 }).notNull(),
  parentId: varchar("parent_id", { length: 128 }),
  name: varchar("name", { length: 256 }).notNull(),
  status: statusEnum("status").notNull().default("unknown"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  // Free-form labels for grouping/filtering. Hybrid format: a bare string
  // ("wireguard") is a label; a string with a colon ("env:prod") is parsed
  // as key:value at filter/search time. Stored as-is — no parsing on write.
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  position: jsonb("position").$type<{ x: number; y: number } | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── inventory.edges ──────────────────────────────────────────────────

export const edges = inventory.table("edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: varchar("source_id", { length: 128 }).notNull(),
  targetId: varchar("target_id", { length: 128 }).notNull(),
  // 'contains' (parent→child), 'depends', 'routes', 'mounts', ...
  type: varchar("type", { length: 64 }).notNull().default("contains"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── docs.runbooks ────────────────────────────────────────────────────

// Canonical RunbookMeta type lives in api/src/runbooks/loader.ts (where the
// loader/writer normalize it). The DB column just stores the blob as jsonb;
// `as unknown as` keeps drizzle happy without dragging that import in here.
export const runbooks = docs.table("runbooks", {
  id: varchar("id", { length: 256 }).primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  category: runbookCategoryEnum("category").notNull().default("task"),
  status: runbookStatusEnum("status").notNull().default("planned"),
  // Shown in list view so the user picks the right runbook without opening it.
  summary: text("summary").notNull().default(""),
  markdown: text("markdown").notNull().default(""),
  // ["nodeId1", "nodeId2"] — inline references for click-to-jump
  nodeRefs: jsonb("node_refs").$type<string[]>().notNull().default([]),
  // Catch-all for everything else in frontmatter (see RunbookMeta in
  // runbooks/loader.ts). Loose Record so the index-signature shape passes
  // through; the loader normalizes typed fields on read.
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({
    tags: [], runbookRefs: [], severity: "", author: "", template: null, schema: 1,
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── monitoring.alerts ────────────────────────────────────────────────

export const alerts = monitoring.table("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  severity: alertSeverityEnum("severity").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  detail: text("detail"),
  nodeId: varchar("node_id", { length: 128 }),
  age: varchar("age", { length: 32 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── auth.users / auth.sessions ───────────────────────────────────────
// Single-admin auth (grafana/argocd-style built-in login). users is
// kept multi-row-capable for the future; sessions holds opaque session
// tokens so logout / "kill all sessions" works server-side.

export const users = auth.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 128 }).notNull().unique(),
  // scrypt-encoded string: "scrypt$N$r$p$saltB64$hashB64"
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = auth.table("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  // sha256(cookieToken + AUTH_SECRET) — the raw token is never stored,
  // so a DB leak doesn't hand over live session tokens.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
