// Split-view runbook editor. Left = CodeMirror with markdown syntax; right
// = caller-rendered preview (so the existing inline [[id]] mention
// handling in LabDetail.renderMarkdown keeps working without re-plumbing).
//
// Save model: debounced auto-save (1.5s after typing pauses) plus a Cmd+S
// flush for impatient hands. The mutation runs via the SorackData hook so
// react-query cache stays in sync.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { diffLines } from "diff";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { autocompletion, completionKeymap, acceptCompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { keymap, type EditorView as CMEditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { useIsDesktop } from "@/lib/use-is-desktop";

const SAVE_DEBOUNCE_MS = 1500;
const PCT_LS_KEY = "sorack-rb-editor-pct";
const VIEW_LS_KEY = "sorack-rb-editor-view";
type ViewMode = "split" | "edit" | "preview";

export interface MentionItem { id: string; label: string; }
export interface MentionSources {
  nodes: MentionItem[];
  runbooks: MentionItem[];
}

export interface RunbookEditorProps {
  runbookId: string;
  initialContent: string;
  previewRender: (md: string) => ReactNode;
  onSave: (markdown: string) => Promise<unknown>;
  mentions: MentionSources;
}

// Builds the autocomplete source consumed by @codemirror/autocomplete. The
// regex captures everything from `[[` to the cursor; we re-parse to know
// whether the user picked a kind yet, then suggest from the matching list.
function makeMentionSource(mentionsRef: { current: MentionSources }) {
  return (context: CompletionContext): CompletionResult | null => {
    const m = context.matchBefore(/\[\[[\w:-]*/);
    if (!m) return null;
    const text = m.text; // includes leading "[["
    const inner = text.slice(2); // after "[["
    const colonAt = inner.indexOf(":");
    const kind = colonAt >= 0 ? inner.slice(0, colonAt) : "";
    const prefix = colonAt >= 0 ? inner.slice(colonAt + 1) : inner;

    const { nodes, runbooks } = mentionsRef.current;
    const candidates: Array<{ kind: "node" | "runbook"; item: MentionItem }> = [];
    if (!kind || kind === "node") {
      for (const it of nodes) candidates.push({ kind: "node", item: it });
    }
    if (!kind || kind === "runbook") {
      for (const it of runbooks) candidates.push({ kind: "runbook", item: it });
    }
    const lower = prefix.toLowerCase();
    const filtered = candidates
      .filter(({ item }) => item.id.toLowerCase().includes(lower) || item.label.toLowerCase().includes(lower))
      .slice(0, 40);
    if (filtered.length === 0 && !context.explicit) return null;

    return {
      from: m.from,
      to: m.to,
      // We already filtered by id AND label above; CodeMirror's built-in
      // re-filter would then match the user's prefix against `label`
      // (= `[[node:id]]`) and miss anything found via the human name.
      filter: false,
      options: filtered.map(({ kind: k, item }) => {
        const insert = `[[${k}:${item.id}]]`;
        return {
          label: insert,
          displayLabel: item.id,
          detail: `${k} · ${item.label}`,
          // Skip a trailing `]]` if the user already typed one; without this
          // accepting after `[[node:k|]]` left `[[node:k8s-cluster]]]]`.
          apply: (view: CMEditorView, _c: unknown, from: number, to: number) => {
            const after = view.state.doc.sliceString(to, to + 2);
            const finalTo = after === "]]" ? to + 2 : to;
            view.dispatch({
              changes: { from, to: finalTo, insert },
              selection: { anchor: from + insert.length },
            });
          },
        };
      }),
    };
  };
}

type SaveState = "idle" | "dirty" | "saving" | "saved";

// Unified diff modal. Defined OUTSIDE RunbookEditor so each render doesn't
// build a fresh component type (which would remount the modal and lose
// internal scroll position). Direction: base = external (disk), head =
// draft (mine) — standard git-diff orientation so `+` reads as "lines I
// added vs disk", `-` as "lines disk has that I'd discard if I keep mine".
interface DiffModalProps {
  draft: string;
  external: string;
  title: string;
  closeLabel: string;
  emptyLabel: string;
  onClose: () => void;
}
function DiffModal({ draft, external, title, closeLabel, emptyLabel, onClose }: DiffModalProps) {
  // Esc closes. Capture-phase + stopImmediatePropagation so the underlying
  // Sheet / panel doesn't also dismiss on the same keystroke (the gallery
  // had the same trap — `1d16008`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [onClose]);

  // diff once per (draft, external) pair. Modal usually opens, user reads,
  // closes — recomputation only matters if a typing session reopens it.
  const lines = useMemo(() => {
    const parts = diffLines(external, draft);
    const out: Array<{ kind: "add" | "del" | "ctx"; text: string; key: string }> = [];
    parts.forEach((part, pi) => {
      const kind: "add" | "del" | "ctx" = part.added ? "add" : part.removed ? "del" : "ctx";
      // `diffLines` returns groups whose value ends in a trailing "\n" for
      // each terminated line; splitting then drops the resulting empty
      // sentinel without touching genuine blank lines inside the group.
      const rawLines = part.value.split("\n");
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
      rawLines.forEach((line, li) => {
        out.push({ kind, text: line, key: `${pi}-${li}` });
      });
    });
    return out;
  }, [draft, external]);

  const hasChanges = lines.some((l) => l.kind !== "ctx");

  return createPortal(
    <div className="rb-diff-overlay" onClick={onClose}>
      <div
        className="rb-diff-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="rb-diff-head">
          <span className="rb-diff-title">{title}</span>
          <button className="rb-diff-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>✕</button>
        </div>
        <div className="rb-diff-body">
          {!hasChanges ? (
            <div className="rb-diff-empty">{emptyLabel}</div>
          ) : (
            lines.map((l) => (
              <div key={l.key} className={`rb-diff-line rb-diff-line--${l.kind}`}>
                <span className="rb-diff-prefix">
                  {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
                </span>
                <span className="rb-diff-text">{l.text || " "}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RunbookEditor({ runbookId, initialContent, previewRender, onSave, mentions }: RunbookEditorProps) {
  const { t } = useTranslation("common");

  // Keep mention sources in a ref so the completion source (built once) reads
  // the latest list each invocation without us recreating the extension.
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;

  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<SaveState>("idle");
  const timerRef = useRef<number | null>(null);
  // Latest values, accessible from setTimeout / keydown callbacks whose
  // closures would otherwise see the content/savedContent from the render
  // they were registered in (stale closure → save sends an older draft).
  const contentRef = useRef(initialContent);
  const savedRef = useRef(initialContent);
  contentRef.current = content;
  // The pending save closure — captured at handleChange time with the
  // then-current `onSave` (= the runbook the user was editing). On runbook
  // switch we invoke this immediately so the draft commits to the OLD
  // runbook before we reset state. Without this, a pending setTimeout would
  // fire AFTER the switch, into a world where the captured onSave still
  // points at the previous runbook — visible to the user as "I edited X
  // but Y got modified" when the autosave races with the navigation.
  const pendingFlushRef = useRef<(() => void) | null>(null);

  // External-edit conflict tracking. When SSE refetch arrives while the user
  // has unsaved work, we surface a banner instead of silently dropping either
  // side. pendingExternalRef holds the incoming version so the banner's
  // "reload" action can apply it without re-fetching.
  const pendingExternalRef = useRef<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  // Reset only when switching to a different runbook. We intentionally don't
  // depend on initialContent here — react-query refetches after every save
  // and would stomp on the user's in-progress draft.
  //
  // Cleanup commits any pending draft to the PREVIOUS runbook *before* the
  // next effect's reset runs (React runs cleanup → next effect in that
  // order). The pending closure was captured under the previous render's
  // `onSave`, so the save lands on the right target.
  useEffect(() => {
    setContent(initialContent);
    savedRef.current = initialContent;
    setState("idle");
    pendingExternalRef.current = null;
    setHasConflict(false);
    setDiffOpen(false);
    return () => {
      if (pendingFlushRef.current) {
        pendingFlushRef.current();
        pendingFlushRef.current = null;
      }
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runbookId]);

  // Track latest state via ref so the initialContent effect below reads the
  // current value (the effect runs once per initialContent change; state
  // captured at that moment would be stale by the time the user types).
  const stateRef = useRef(state);
  stateRef.current = state;

  // External-edit detection. SSE-triggered refetch updates `initialContent`.
  //   - matches our last saved value → self-echo from our own write, skip
  //   - matches current buffer → no change to apply, skip
  //   - at rest (idle/saved) → auto-accept (silent, AI/vim/other-tab friendly)
  //   - mid-edit (dirty/saving) → stash incoming + raise conflict banner so
  //     the user decides (keep draft = last-write-wins on next save / reload
  //     external = drop draft, take incoming).
  useEffect(() => {
    const dbg = (...args: unknown[]) => { if (import.meta.env.DEV) console.log("[rb-editor]", runbookId, ...args); };
    if (initialContent === savedRef.current) { dbg("incoming === savedRef → self-echo, skip"); return; }
    if (initialContent === contentRef.current) { dbg("incoming === contentRef → no-op, skip"); return; }

    const s = stateRef.current;
    if (s === "idle" || s === "saved") {
      dbg("auto-accept (state=" + s + ")");
      setContent(initialContent);
      savedRef.current = initialContent;
      return;
    }

    // dirty / saving. Guard against re-raising on the same incoming value
    // (re-renders could otherwise pulse the banner).
    if (pendingExternalRef.current === initialContent) { dbg("conflict already raised for this version, skip"); return; }
    dbg("raise conflict (state=" + s + ")");
    pendingExternalRef.current = initialContent;
    setHasConflict(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent]);

  // Conflict actions. `dismiss` keeps the user's draft (next save will
  // overwrite the external change — last-write-wins). `accept` drops the
  // draft and adopts the external version.
  const dismissConflict = () => {
    pendingExternalRef.current = null;
    setHasConflict(false);
    setDiffOpen(false);
  };
  const acceptExternal = async () => {
    const ext = pendingExternalRef.current;
    if (ext == null) {
      setHasConflict(false);
      return;
    }
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingFlushRef.current = null;
    // If a save was in flight when the user chose "reload external", the
    // pending write would otherwise resolve with the now-discarded draft as
    // the authoritative version — a chokidar cycle later would surface it as
    // a fresh external change. Re-commit `ext` so the last write wins.
    const wasSaving = stateRef.current === "saving";
    setContent(ext);
    savedRef.current = ext;
    setState("idle");
    pendingExternalRef.current = null;
    setHasConflict(false);
    setDiffOpen(false);
    if (wasSaving) {
      try { await onSave(ext); } catch (e) { console.error("[runbook] reload-save failed:", e); }
    }
  };

  const flush = async (md: string) => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (md === savedRef.current) return;
    setState("saving");
    try {
      await onSave(md);
      savedRef.current = md;
      // Only mark saved if no newer keystrokes have arrived during the await.
      if (contentRef.current === md) setState("saved");
    } catch (e) {
      console.error("[runbook] save failed:", e);
      setState("dirty");
    }
  };
  // Mirror the latest flush so the keydown listener (registered once on
  // mount with empty deps) sees the current render's closures. Without
  // this, Cmd+S always invoked the mount-time flush — which still pointed
  // at the runbook that was open when the editor first mounted. Switching
  // runbooks afterwards routed every Cmd+S to the original target.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Cmd+S / Ctrl+S flushes the debounce immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        flushRef.current(contentRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleChange = (v: string) => {
    setContent(v);
    setState("dirty");
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    // Capture the flush call in a ref so the runbookId-change useEffect can
    // invoke it synchronously to commit the draft to the CURRENT runbook
    // (whose onSave is closed over `flush` here) before swapping props.
    const doFlush = () => flush(v);
    pendingFlushRef.current = doFlush;
    timerRef.current = window.setTimeout(() => {
      pendingFlushRef.current = null;
      doFlush();
    }, SAVE_DEBOUNCE_MS);
  };

  // View mode + split ratio. Persisted so the user's layout sticks across
  // sessions. On mobile, `split` collapses to `edit` (Preview takes the full
  // pane in its own mode); the desktop 3-state toggle is hidden.
  const isDesktop = useIsDesktop();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = localStorage.getItem(VIEW_LS_KEY);
    return v === "edit" || v === "preview" || v === "split" ? v : "split";
  });
  const [editPct, setEditPct] = useState<number>(() => {
    const v = Number(localStorage.getItem(PCT_LS_KEY));
    return Number.isFinite(v) && v >= 20 && v <= 80 ? v : 50;
  });
  useEffect(() => { localStorage.setItem(VIEW_LS_KEY, viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem(PCT_LS_KEY, String(editPct)); }, [editPct]);

  // Drag the splitter to resize. Capture pointer + compute ratio against the
  // split element's bounding rect each move.
  const splitRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startPct: number; rectW: number } | null>(null);
  const onSplitterDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!splitRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("rb-editor-divider--dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    dragRef.current = { startX: e.clientX, startPct: editPct, rectW: splitRef.current.getBoundingClientRect().width };
  };
  const onSplitterMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const pct = dragRef.current.startPct + (dx / dragRef.current.rectW) * 100;
    setEditPct(Math.max(20, Math.min(80, pct)));
  };
  const onSplitterUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.currentTarget.classList.remove("rb-editor-divider--dragging");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    dragRef.current = null;
  };

  // Mobile uses Edit / Preview tabs only. Force a non-split mode and coerce
  // any persisted `split` to `edit` so the layout makes sense in one column.
  const effectiveMode: ViewMode = !isDesktop && viewMode === "split" ? "edit" : viewMode;
  const showEdit = effectiveMode === "edit" || effectiveMode === "split";
  const showPreview = effectiveMode === "preview" || effectiveMode === "split";
  const gridCols = effectiveMode === "split"
    ? `${editPct}% 6px ${100 - editPct}%`
    : showEdit ? "1fr 0 0" : "0 0 1fr";

  const extensions = useMemo(() => [
    markdown(),
    EditorView.lineWrapping,
    autocompletion({
      override: [makeMentionSource(mentionsRef)],
      activateOnTyping: true,
      closeOnBlur: true,
    }),
    // Tab also accepts a completion (default is Enter only). High precedence
    // so it wins over markdown's Tab indent binding (otherwise Tab would just
    // shift text right while the completion popup stays open).
    Prec.high(keymap.of([{ key: "Tab", run: acceptCompletion }])),
    keymap.of(completionKeymap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="rb-editor">
      <div className="rb-editor-statusbar">
        <span className={`rb-editor-status rb-editor-status--${state}`}>
          {state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "dirty" ? "unsaved" : "—"}
        </span>
        <div className="rb-editor-viewbtns" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === "edit"}
            className={`rb-editor-viewbtn ${effectiveMode === "edit" ? "rb-editor-viewbtn--on" : ""}`}
            onClick={() => setViewMode("edit")}
            title="Edit only"
          >edit</button>
          {isDesktop && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveMode === "split"}
              className={`rb-editor-viewbtn ${effectiveMode === "split" ? "rb-editor-viewbtn--on" : ""}`}
              onClick={() => setViewMode("split")}
              title="Split view"
            >split</button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === "preview"}
            className={`rb-editor-viewbtn ${effectiveMode === "preview" ? "rb-editor-viewbtn--on" : ""}`}
            onClick={() => setViewMode("preview")}
            title="Preview only"
          >preview</button>
        </div>
        <span className="rb-editor-hint">⌘S</span>
      </div>
      {hasConflict && (
        <div className="rb-editor-conflict" role="status">
          <span className="rb-editor-conflict-msg">{t("runbook.conflict.message")}</span>
          <button
            type="button"
            className="rb-editor-conflict-btn"
            onClick={() => setDiffOpen(true)}
          >{t("runbook.conflict.viewDiff")}</button>
          <button
            type="button"
            className="rb-editor-conflict-btn rb-editor-conflict-btn--accept"
            onClick={acceptExternal}
          >{t("runbook.conflict.reload")}</button>
          <button
            type="button"
            className="rb-editor-conflict-btn"
            onClick={dismissConflict}
          >{t("runbook.conflict.keepDraft")}</button>
          <button
            type="button"
            className="rb-editor-conflict-close"
            onClick={dismissConflict}
            aria-label={t("runbook.conflict.dismiss")}
            title={t("runbook.conflict.dismiss")}
          >✕</button>
        </div>
      )}
      {hasConflict && diffOpen && (
        <DiffModal
          draft={content}
          external={pendingExternalRef.current ?? ""}
          title={t("runbook.conflict.diffTitle")}
          closeLabel={t("runbook.conflict.dismiss")}
          emptyLabel={t("runbook.conflict.diffEmpty")}
          onClose={() => setDiffOpen(false)}
        />
      )}
      <div className="rb-editor-split" ref={splitRef} style={{ gridTemplateColumns: gridCols }}>
        <div
          className="rb-editor-pane rb-editor-pane--edit"
          style={{ gridColumn: 1, display: showEdit ? undefined : "none" }}
        >
          <CodeMirror
            value={content}
            onChange={handleChange}
            extensions={extensions}
            theme="none"
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLineGutter: false,
            }}
            style={{ height: "100%", fontSize: 13 }}
          />
        </div>
        <div
          className="rb-editor-divider"
          style={{ gridColumn: 2, display: effectiveMode === "split" ? undefined : "none" }}
          onPointerDown={onSplitterDown}
          onPointerMove={onSplitterMove}
          onPointerUp={onSplitterUp}
          onPointerCancel={onSplitterUp}
          role="separator"
          aria-orientation="vertical"
        />
        <div
          className="rb-editor-pane rb-editor-pane--preview"
          style={{ gridColumn: 3, display: showPreview ? undefined : "none" }}
        >
          <div className="rb-content">{previewRender(content)}</div>
        </div>
      </div>
    </div>
  );
}
