// Single hook (useSorack) that returns inventory + helpers + mutations.
// React Query handles fetching / caching / refetching; description overrides
// are kept client-side (localStorage) via data.tsx.
// @ts-nocheck — same scope as the design components it serves.
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchInventory,
  fetchRunbooks,
  fetchAlerts,
  createNode,
  updateNode,
  deleteNode,
  createEdge,
  updateEdge,
  deleteEdge,
  createRunbook,
  updateRunbook,
  deleteRunbook,
  type NodeCreatePayload,
  type NodeUpdatePayload,
  type EdgeCreatePayload,
  type EdgeUpdatePayload,
  type RunbookCreatePayload,
  type RunbookUpdatePayload,
  type ApiEdge,
  type ApiRunbook,
} from "./api";
import { history } from "@/lib/history";
import { slugify, uniqueSlug } from "@/lib/slug";
import { getOverride, setOverride } from "@/lib/data";

// ──────────────────────────────────────────────────────────────────────

// FAVORITES persist as a quick-jump list in localStorage. Will move to
// DB once user accounts land (Phase 4+).
const FAV_LS_KEY = "sorack-favorites-v1";
function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_LS_KEY) || "[]");
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// Context type matches the legacy mock data shape so consumers can keep
// using `NODES[id]` / `getChildren(id)` / `searchAll(q)` unchanged.

interface SorackData {
  NODES: Record<string, any>;
  // Explicit (DB-stored) edges, type ∈ {depends, mounts, routes, ...}.
  // Parent→child 'contains' edges are NOT here — they're derived from
  // node.parentId. See TopologyFlow for the merge.
  EDGES: ApiEdge[];
  RUNBOOKS: Record<string, any>;
  ALERTS: any[];
  FAVORITES: string[];

  // helpers (closed over the current NODES/RUNBOOKS)
  getNode: (id: string) => any;
  getChildren: (id: string) => any[];
  getPath: (id: string) => any[];
  searchAll: (q: string) => any[];

  // description overrides (localStorage-backed)
  getOverride: typeof getOverride;
  setOverride: typeof setOverride;

  // node mutations (Phase 3B) — each resolves to the server's view of the row
  // and invalidates the inventory query so the topology refreshes.
  createNode: (payload: NodeCreatePayload) => Promise<any>;
  updateNode: (id: string, patch: NodeUpdatePayload) => Promise<any>;
  deleteNode: (id: string) => Promise<any>;
  // Bulk variants for multi-select actions. Suspend per-op history.push and
  // emit a single batch entry at the end so one ⌘Z reverts the whole set.
  bulkUpdate: (items: Array<{ id: string; patch: NodeUpdatePayload }>) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;

  // Edge mutations (Phase 3D). Same shape as the node ones.
  createEdge: (payload: EdgeCreatePayload) => Promise<ApiEdge>;
  updateEdge: (id: string, patch: EdgeUpdatePayload) => Promise<ApiEdge>;
  deleteEdge: (id: string) => Promise<any>;
  // Runbook mutations (Epic 5 Phase 1b). File is the source of truth on disk;
  // these endpoints write the file + cache row, then react-query refetches.
  createRunbook: (payload: RunbookCreatePayload) => Promise<ApiRunbook>;
  updateRunbook: (id: string, patch: RunbookUpdatePayload) => Promise<ApiRunbook>;
  deleteRunbook: (id: string) => Promise<any>;
  // Sets node.name. If the node was created with meta.idAuto (an
  // auto-named "New" placeholder), this also re-slugs the id from the
  // new name and cascades parentId updates to all children, so the
  // id stops being "new" after the user names the node for real.
  // `opts.nextId` overrides the auto-derived slug (used by the new-node
  // setup form so the user can pick a non-slugified id). Caller is
  // responsible for collision-checking the override before passing it.
  // Returns the id the node now has (same id if no rekey happened).
  renameNode: (id: string, newName: string, opts?: { nextId?: string }) => Promise<string>;

  loading: boolean;
}

// Mirror the server's PATCH /api/nodes/:id merge so optimistic cache updates
// match what will be persisted (refetch reconciles any drift):
//   - top-level fields from patch overwrite, but null root meta keys are dropped
//   - meta is deep-merged one level; meta.manual is partial-merged with its own
//     null-key strip; incoming meta.observed is ignored (collector-owned)
function applyNodePatch(node: any, patch: any): any {
  const next: any = { ...node, ...patch };
  if (patch?.meta) {
    const curMeta = (node.meta ?? {}) as Record<string, any>;
    const incMeta = patch.meta as Record<string, any>;
    const merged: Record<string, any> = { ...curMeta };
    for (const [k, v] of Object.entries(incMeta)) {
      if (k === "observed") continue; // collector-owned; UI never writes it
      if (k === "manual") {
        const curManual = (curMeta.manual ?? {}) as Record<string, any>;
        const incManual = (v ?? {}) as Record<string, any>;
        const m: Record<string, any> = { ...curManual };
        for (const [mk, mv] of Object.entries(incManual)) {
          if (mv === null || mv === undefined) delete m[mk];
          else m[mk] = mv;
        }
        merged.manual = m;
        continue;
      }
      if (v === null || v === undefined) delete merged[k];
      else merged[k] = v;
    }
    next.meta = merged;
  }
  return next;
}

const SorackCtx = createContext<SorackData | null>(null);

// ──────────────────────────────────────────────────────────────────────

function DataInner({ children }: { children: ReactNode }) {
  // Poll inventory so collector-written observed.* (health, k8s) shows live.
  // Small payload; structure-keyed layout means a same-shape refetch doesn't
  // disturb the map. The strip's "checked Ns ago" ticks client-side, so this
  // interval only governs how fast a real status CHANGE appears.
  const inv = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory, refetchInterval: 5_000 });
  const rbs = useQuery({ queryKey: ["runbooks"], queryFn: fetchRunbooks });
  const als = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });

  const qc = useQueryClient();
  const invalidateInventory = () => qc.invalidateQueries({ queryKey: ["inventory"] });
  const createNodeM = useMutation({ mutationFn: createNode, onSuccess: invalidateInventory });
  const updateNodeM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: NodeUpdatePayload }) => updateNode(id, patch),
    // Optimistic: apply the patch to the cached inventory immediately so the UI
    // (gallery checks, header type/icon, field edits) reflects the change
    // without waiting for the DB round-trip + refetch. The merge mirrors the
    // server PATCH (meta deep-merge, manual partial-merge, strip incoming
    // observed, drop null keys); the refetch in onSettled reconciles anyway, so
    // small divergences self-correct.
    onMutate: async ({ id, patch }: { id: string; patch: NodeUpdatePayload }) => {
      await qc.cancelQueries({ queryKey: ["inventory"] });
      const prev = qc.getQueryData<any>(["inventory"]);
      qc.setQueryData<any>(["inventory"], (cur: any) => {
        if (!cur?.nodes) return cur;
        return {
          ...cur,
          nodes: cur.nodes.map((n: any) => (n.id === id ? applyNodePatch(n, patch) : n)),
        };
      });
      return { prev };
    },
    onError: (_e, _vars, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["inventory"], ctx.prev);
    },
    onSettled: invalidateInventory,
  });
  const deleteNodeM = useMutation({ mutationFn: deleteNode, onSuccess: invalidateInventory });

  const createEdgeM = useMutation({ mutationFn: createEdge, onSuccess: invalidateInventory });
  const updateEdgeM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EdgeUpdatePayload }) => updateEdge(id, patch),
    onSuccess: invalidateInventory,
  });
  const deleteEdgeM = useMutation({ mutationFn: deleteEdge, onSuccess: invalidateInventory });

  const invalidateRunbooks = () => qc.invalidateQueries({ queryKey: ["runbooks"] });
  const createRunbookM = useMutation({ mutationFn: createRunbook, onSuccess: invalidateRunbooks });
  const updateRunbookM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RunbookUpdatePayload }) => updateRunbook(id, patch),
    onSuccess: invalidateRunbooks,
  });
  const deleteRunbookM = useMutation({ mutationFn: deleteRunbook, onSuccess: invalidateRunbooks });

  // SSE — one long-lived EventSource per tab. Browser handles auto-reconnect
  // with exponential backoff; on each (re)connect the server emits a
  // `connected` event and we invalidate everything to catch up on anything
  // missed during the disconnect window. Subsequent events route to the
  // matching queryKey invalidation.
  useEffect(() => {
    const es = new EventSource("/api/events");
    const invalidateRb = () => qc.invalidateQueries({ queryKey: ["runbooks"] });
    es.addEventListener("connected", () => {
      qc.invalidateQueries({ queryKey: ["runbooks"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    });
    es.addEventListener("runbook.changed", invalidateRb);
    es.addEventListener("runbook.deleted", invalidateRb);
    es.addEventListener("ping", () => {}); // heartbeat, ignored
    es.onerror = () => {/* browser auto-reconnects; suppress console noise */};
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref to the latest server-shape nodes so the history wrappers can
  // snapshot "before" state without re-rendering on every NODES change.
  const apiNodesRef = useRef(inv.data?.nodes ?? []);
  apiNodesRef.current = inv.data?.nodes ?? [];

  const value = useMemo<SorackData>(() => {
    // Convert api arrays to the {id: node} record shape the design code uses.
    // Mock-era fields (children/spec/metrics/...) are stubbed with safe
    // defaults so the design components keep working until each one gets
    // migrated to a real backend representation.
    const NODES: Record<string, any> = {};
    for (const n of inv.data?.nodes ?? []) {
      NODES[n.id] = {
        ...n,
        kind: n.type,
        children: [],
        spec: {},
        metrics: undefined,
        subtitle: undefined,
        warnings: [],
        // `tags` no longer stubbed — it's a real column on inventory.nodes
        // now (Stage 1 of the tags feature). The spread above carries the
        // API value through; an old DB row without the column reads as
        // undefined, and consumers normalize with `?? []`.
        runbooks: [],
        description: "",
      };
    }
    // populate children id lists from parentId (used by NodeDetail child list)
    for (const n of Object.values(NODES) as any[]) {
      if (n.parentId && NODES[n.parentId]) {
        NODES[n.parentId].children.push(n.id);
      }
    }
    const RUNBOOKS: Record<string, any> = {};
    for (const r of rbs.data ?? []) {
      // alias schema fields → lab mockup expectations. New meta fields
      // (tags/runbookRefs/severity/author/template/schema) come through as
      // `r.meta.*` — consumers read them by full path.
      RUNBOOKS[r.id] = {
        ...r,
        state: r.status,
        md: r.markdown,
        updated: r.updatedAt ? String(r.updatedAt).slice(0, 10) : "",
        tags: r.meta?.tags ?? [],
      };
    }
    // Reverse-link: a runbook in its `nodeRefs` is shown on each referenced
    // node's detail panel. Computed here so consumers can read node.runbooks
    // without scanning the runbook list every render.
    for (const r of Object.values(RUNBOOKS) as any[]) {
      for (const nid of (r.nodeRefs ?? []) as string[]) {
        if (NODES[nid]) NODES[nid].runbooks.push(r.id);
      }
    }
    const ALERTS = (als.data ?? []).map((a) => ({
      ...a,
      nodeId: a.nodeId,
    }));
    // lab mockup expects [{id, label}] for FAVORITES; legacy mock used string[]
    const FAVORITES = loadFavorites().map((id) => ({
      id,
      label: (NODES[id] as any)?.name ?? id,
    }));

    const getNode = (id: string) => NODES[id];
    const getChildren = (id: string) =>
      Object.values(NODES).filter((n: any) => n.parentId === id);
    const getPath = (id: string) => {
      const path: any[] = [];
      let cur = NODES[id];
      while (cur) {
        path.unshift(cur);
        cur = cur.parentId ? NODES[cur.parentId] : null;
      }
      return path;
    };
    const searchAll = (q: string) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return [];
      const results: any[] = [];
      for (const n of Object.values(NODES) as any[]) {
        const tags = (n.tags ?? []) as string[];
        const nameHit = n.name?.toLowerCase().includes(needle);
        const idHit = n.id.toLowerCase().includes(needle);
        // Tags match by substring against the whole stored string ("env:prod"
        // is matched by "env", "prod", or "env:prod"). The matched tag is
        // forwarded so the result row can highlight which one hit.
        const matchedTag = tags.find((tg) => tg.toLowerCase().includes(needle));
        if (nameHit || idHit || matchedTag) {
          results.push({
            type: "node",
            id: n.id,
            label: n.name,
            sub: `${n.kind || n.type} · ${n.id}`,
            status: n.status,
            tags,
            matchedTag,
          });
        }
      }
      for (const r of Object.values(RUNBOOKS) as any[]) {
        if (r.title?.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle)) {
          results.push({
            type: "runbook",
            id: r.id,
            label: r.title,
            sub: `${r.category} · ${r.status}`,
          });
        }
      }
      return results.slice(0, 40);
    };

    const EDGES = inv.data?.edges ?? [];

    return {
      NODES,
      EDGES,
      RUNBOOKS,
      ALERTS,
      FAVORITES,
      getNode,
      getChildren,
      getPath,
      searchAll,
      getOverride,
      setOverride,
      createNode: async (payload: NodeCreatePayload) => {
        const res = await createNodeM.mutateAsync(payload);
        history.push({ type: "create", payload });
        return res;
      },
      updateNode: async (id: string, patch: NodeUpdatePayload) => {
        // Snapshot the fields we're about to change so undo can put
        // them back. Read from the api-shape ref, not the enriched
        // NODES record, so we round-trip cleanly through the api.
        const current = apiNodesRef.current.find((n) => n.id === id);
        const before: NodeUpdatePayload = {};
        if (current) {
          for (const k of Object.keys(patch) as (keyof NodeUpdatePayload)[]) {
            (before as any)[k] = (current as any)[k] ?? null;
          }
        }
        const res = await updateNodeM.mutateAsync({ id, patch });
        history.push({ type: "update", id, before, after: patch });
        return res;
      },
      deleteNode: async (id: string) => {
        const node = apiNodesRef.current.find((n) => n.id === id);
        const res = await deleteNodeM.mutateAsync(id);
        if (node) history.push({ type: "delete", node });
        return res;
      },
      bulkUpdate: async (items) => {
        const ops: any[] = [];
        await history.suppress(async () => {
          for (const { id, patch } of items) {
            const current = apiNodesRef.current.find((n) => n.id === id);
            const before: NodeUpdatePayload = {};
            if (current) {
              for (const k of Object.keys(patch) as (keyof NodeUpdatePayload)[]) {
                (before as any)[k] = (current as any)[k] ?? null;
              }
            }
            try {
              await updateNodeM.mutateAsync({ id, patch });
              ops.push({ type: "update", id, before, after: patch });
            } catch (e) { console.error("bulkUpdate", id, e); }
          }
        });
        if (ops.length > 0) history.pushBatch(ops);
      },
      bulkDelete: async (ids: string[]) => {
        const ops: any[] = [];
        await history.suppress(async () => {
          for (const id of ids) {
            const node = apiNodesRef.current.find((n) => n.id === id);
            if (!node) continue;
            try {
              await deleteNodeM.mutateAsync(id);
              ops.push({ type: "delete", node });
            } catch (e) { console.error("bulkDelete", id, e); }
          }
        });
        if (ops.length > 0) history.pushBatch(ops);
      },
      createEdge: (payload: EdgeCreatePayload) => createEdgeM.mutateAsync(payload),
      updateEdge: (id: string, patch: EdgeUpdatePayload) => updateEdgeM.mutateAsync({ id, patch }),
      deleteEdge: (id: string) => deleteEdgeM.mutateAsync(id),
      createRunbook: (payload: RunbookCreatePayload) => createRunbookM.mutateAsync(payload),
      updateRunbook: (id: string, patch: RunbookUpdatePayload) => updateRunbookM.mutateAsync({ id, patch }),
      deleteRunbook: (id: string) => deleteRunbookM.mutateAsync(id),
      renameNode: async (id: string, newName: string, opts?: { nextId?: string }) => {
        const name = newName.trim();
        const node = apiNodesRef.current.find((n) => n.id === id);
        if (!node || !name) return id;
        // With no rekey path and an unchanged name, nothing to do. (With a
        // nextId override we still proceed — the user may want to rekey
        // without renaming.)
        const overrideId = opts?.nextId?.trim();
        if (!overrideId && name === node.name) return id;

        const auto = (node.meta as any)?.idAuto === true;
        if (!auto && !overrideId) {
          // Normal rename — id stays.
          await updateNodeM.mutateAsync({ id, patch: { name } });
          history.push({ type: "update", id, before: { name: node.name }, after: { name } });
          return id;
        }

        // Rekey path. Either: (a) idAuto node getting its first real name
        // and auto-slugged into a stable id, or (b) caller passed nextId
        // override (new-node setup form). We push individual history entries
        // for each step so Cmd+Z can step the rename apart — coarse but
        // functional.
        const taken = new Set(apiNodesRef.current.map((n) => n.id));
        taken.delete(id); // the row we're about to delete shouldn't block its own rekey target
        const newId = overrideId
          ? overrideId   // caller already validated, but if it collides createNode will error
          : uniqueSlug(slugify(name) || "node", taken);
        const newMeta = { ...(node.meta || {}) } as Record<string, unknown>;
        delete newMeta.idAuto;

        // 1. create the new node with the same fields under the new id
        await createNodeM.mutateAsync({
          id: newId, type: node.type, name,
          parentId: node.parentId, status: node.status, meta: newMeta,
        });
        history.push({ type: "create", payload: {
          id: newId, type: node.type, name,
          parentId: node.parentId, status: node.status, meta: newMeta,
        } });

        // 2. reparent any children that pointed at the old id
        const children = apiNodesRef.current.filter((n) => n.parentId === id);
        for (const c of children) {
          await updateNodeM.mutateAsync({ id: c.id, patch: { parentId: newId } });
          history.push({ type: "update", id: c.id,
            before: { parentId: id }, after: { parentId: newId } });
        }

        // 3. drop the old row
        await deleteNodeM.mutateAsync(id);
        history.push({ type: "delete", node });

        return newId;
      },
      loading: inv.isLoading || rbs.isLoading || als.isLoading,
    };
  }, [inv.data, rbs.data, als.data, inv.isLoading, rbs.isLoading, als.isLoading,
      createNodeM, updateNodeM, deleteNodeM,
      createEdgeM, updateEdgeM, deleteEdgeM,
      createRunbookM, updateRunbookM, deleteRunbookM]);

  return <SorackCtx.Provider value={value}>{children}</SorackCtx.Provider>;
}

// QueryClientProvider now lives in main.tsx (shared with AuthProvider),
// so this just wires the data context. Must be mounted under that
// provider — AuthGate does so only after authentication.
export function SorackDataProvider({ children }: { children: ReactNode }) {
  return <DataInner>{children}</DataInner>;
}

export function useSorack(): SorackData {
  const ctx = useContext(SorackCtx);
  if (!ctx) throw new Error("useSorack must be inside <SorackDataProvider>");
  return ctx;
}
