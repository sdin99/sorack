// Split-view runbook editor. Left = CodeMirror with markdown syntax; right
// = caller-rendered preview (so the existing inline [[id]] mention
// handling in LabDetail.renderMarkdown keeps working without re-plumbing).
//
// Save model: debounced auto-save (1.5s after typing pauses) plus a Cmd+S
// flush for impatient hands. The mutation runs via the SorackData hook so
// react-query cache stays in sync.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

export function RunbookEditor({ runbookId, initialContent, previewRender, onSave, mentions }: RunbookEditorProps) {
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

  // Reset only when switching to a different runbook. We intentionally don't
  // depend on initialContent — react-query refetches after every save and
  // would otherwise stomp on the user's in-progress draft.
  useEffect(() => {
    setContent(initialContent);
    savedRef.current = initialContent;
    setState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runbookId]);

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

  // Cmd+S / Ctrl+S flushes the debounce immediately using the latest content
  // from the ref (the closure captured at listener-mount would be empty).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        flush(contentRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (v: string) => {
    setContent(v);
    setState("dirty");
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    // Pass the new value into the timer — closure-captured `content` would be
    // stale by the time the 1.5s fires.
    timerRef.current = window.setTimeout(() => { flush(v); }, SAVE_DEBOUNCE_MS);
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
