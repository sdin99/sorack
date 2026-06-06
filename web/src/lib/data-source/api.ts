// API client — fetches the inventory/runbooks/alerts the web shell needs.
// Errors bubble to React Query; callers don't need try/catch.

export interface ApiNode {
  id: string;
  type: string;
  parentId: string | null;
  name: string;
  status: "ok" | "warn" | "err" | "unknown";
  meta: Record<string, unknown>;
  // Free-form labels — hybrid format. "wireguard" = bare label, "env:prod" =
  // key:value (parsed at filter time, stored as-is).
  tags: string[];
  position: { x: number; y: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface RunbookTemplateRef {
  source: string; id: string; version: string; derivedAt: string;
}
export interface RunbookMeta {
  tags: string[];
  runbookRefs: string[];
  severity: string;
  author: string;
  template: RunbookTemplateRef | null;
  schema: number;
}
export interface ApiRunbook {
  id: string;
  title: string;
  category: "task" | "sop" | "incident" | "postmortem" | "design_doc";
  status: "planned" | "in_progress" | "completed" | "rolled_back";
  summary: string;
  markdown: string;
  nodeRefs: string[];
  meta: RunbookMeta;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAlert {
  id: string;
  severity: "ok" | "warn" | "err";
  title: string;
  detail: string | null;
  nodeId: string | null;
  age: string | null;
  createdAt: string;
}

// Thrown on a 401 so callers (and the global handler) can distinguish
// "logged out" from other failures.
export class UnauthorizedError extends Error {
  constructor() { super("unauthorized"); this.name = "UnauthorizedError"; }
}

// Global 401 hook — AuthProvider registers this so an expired session
// anywhere flips the app back to the login gate.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (r.status === 401) { onUnauthorized?.(); throw new UnauthorizedError(); }
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function sendJSON<T>(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { onUnauthorized?.(); throw new UnauthorizedError(); }
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.json()).error ?? ""; } catch { /* swallow */ }
    throw new Error(`${method} ${url} ${r.status}${detail ? `: ${detail}` : ""}`);
  }
  return r.json();
}

export const fetchInventory = () =>
  getJSON<{ nodes: ApiNode[]; edges: ApiEdge[] }>("/api/inventory");
export const fetchRunbooks = () => getJSON<ApiRunbook[]>("/api/runbooks");

export interface RunbookCreatePayload {
  title: string;
  category?: ApiRunbook["category"];
  status?: ApiRunbook["status"];
  summary?: string;
  markdown?: string;
  nodeRefs?: string[];
  meta?: Partial<RunbookMeta>;
}
export type RunbookUpdatePayload = Partial<RunbookCreatePayload>;

export const createRunbook = (payload: RunbookCreatePayload) =>
  sendJSON<ApiRunbook>("POST", "/api/runbooks", payload);
export const updateRunbook = (id: string, patch: RunbookUpdatePayload) =>
  sendJSON<ApiRunbook>("PATCH", `/api/runbooks/${encodeURIComponent(id)}`, patch);
export const deleteRunbook = (id: string) =>
  sendJSON<{ ok: true }>("DELETE", `/api/runbooks/${encodeURIComponent(id)}`);

export interface ApiRunbookTemplate {
  id: string;
  name: string;
  description: string;
  category: ApiRunbook["category"];
  summary: string;
  markdown: string;
}
export const fetchRunbookTemplates = () => getJSON<ApiRunbookTemplate[]>("/api/runbooks/_templates");
export const fetchAlerts = () => getJSON<ApiAlert[]>("/api/alerts");

// ── node mutations (Phase 3B) ────────────────────────────────────────

export interface NodeCreatePayload {
  id: string;
  type: string;
  name: string;
  parentId?: string | null;
  status?: ApiNode["status"];
  meta?: Record<string, unknown>;
  tags?: string[];
  position?: { x: number; y: number } | null;
}
export type NodeUpdatePayload = Partial<Omit<NodeCreatePayload, "id">>;

export const createNode = (payload: NodeCreatePayload) =>
  sendJSON<ApiNode>("POST", "/api/nodes", payload);
export const updateNode = (id: string, patch: NodeUpdatePayload) =>
  sendJSON<ApiNode>("PATCH", `/api/nodes/${encodeURIComponent(id)}`, patch);
export const deleteNode = (id: string) =>
  sendJSON<{ ok: true }>("DELETE", `/api/nodes/${encodeURIComponent(id)}`);

// Run a probe config once without saving — for the "test connection" button.
export interface ProbeTestResult {
  status: "ok" | "warn" | "err" | "unknown";
  latencyMs?: number;
  message?: string;
}
export const testProbe = (id: string, config: Record<string, unknown>) =>
  sendJSON<ProbeTestResult>("POST", `/api/nodes/${encodeURIComponent(id)}/probe/test`, config);

// ── edge mutations (Phase 3D) ────────────────────────────────────────

export interface EdgeCreatePayload {
  sourceId: string;
  targetId: string;
  type?: string;
  meta?: Record<string, unknown>;
}
export type EdgeUpdatePayload = Partial<Pick<EdgeCreatePayload, "type" | "meta">>;

export const createEdge = (payload: EdgeCreatePayload) =>
  sendJSON<ApiEdge>("POST", "/api/edges", payload);
export const updateEdge = (id: string, patch: EdgeUpdatePayload) =>
  sendJSON<ApiEdge>("PATCH", `/api/edges/${encodeURIComponent(id)}`, patch);
export const deleteEdge = (id: string) =>
  sendJSON<{ ok: true }>("DELETE", `/api/edges/${encodeURIComponent(id)}`);

// ── auth ─────────────────────────────────────────────────────────────
// These handle their own 401s (login = bad creds, me = logged out) so
// they don't trip the global onUnauthorized handler / loop.

export interface MeResponse { user: { username: string } }

export async function login(username: string, password: string): Promise<void> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    const err = new Error(detail.error ?? `login ${r.status}`);
    (err as any).status = r.status;
    throw err;
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const r = await fetch("/api/auth/password", {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    const err = new Error(detail.error ?? `password ${r.status}`);
    (err as any).status = r.status;
    throw err;
  }
}

// Resolves to the current user, or null if not authenticated.
export async function fetchMe(): Promise<MeResponse | null> {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`me ${r.status}`);
  return r.json();
}

// ── Git ──────────────────────────────────────────────────────────────
export type GitFieldSource = "env" | "db" | null;
export interface GitStatus {
  configured: boolean;       // git mode + remote OK (client has cfg)
  enabled: boolean;          // explicit storage-mode toggle
  repo: boolean;
  branch?: string;
  dirty: number;
  ahead: number;
  behind: number;
  lastFetchAt?: string;
  remote?: string;
  error?: string;
}
export interface GitConfigView {
  enabled: boolean;
  remote: string;
  branch: string;
  username: string;
  authorName: string;
  authorEmail: string;
  tokenSet: boolean;
  source: {
    enabled: GitFieldSource;
    remote: GitFieldSource;
    branch: GitFieldSource;
    username: GitFieldSource;
    token: GitFieldSource;
    authorName: GitFieldSource;
    authorEmail: GitFieldSource;
  };
}
export type GitConfigPatch = Partial<{
  enabled: boolean;
  remote: string | null;
  branch: string | null;
  username: string | null;
  token: string | null;
  authorName: string | null;
  authorEmail: string | null;
}>;

export const fetchGitStatus = () => getJSON<GitStatus>("/api/git/status");
export const fetchGitConfig = () => getJSON<GitConfigView>("/api/git/config");
export const updateGitConfig = (patch: GitConfigPatch) =>
  sendJSON<{ ok: true }>("PATCH", "/api/git/config", patch);
export const gitPull = () =>
  sendJSON<{ ok: true } | { ok: false; reason: string }>("POST", "/api/git/pull");
export const gitCommitPush = (message: string) =>
  sendJSON<
    | { ok: true; oid: string; filesCommitted: number }
    | { ok: false; reason: string }
  >("POST", "/api/git/commit-push", { message });
