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

const SAVE_DEBOUNCE_MS = 1500;

export interface RunbookEditorProps {
  runbookId: string;
  initialContent: string;
  previewRender: (md: string) => ReactNode;
  onSave: (markdown: string) => Promise<unknown>;
}

type SaveState = "idle" | "dirty" | "saving" | "saved";

export function RunbookEditor({ runbookId, initialContent, previewRender, onSave }: RunbookEditorProps) {
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

  const extensions = useMemo(() => [
    markdown(),
    EditorView.lineWrapping,
  ], []);

  return (
    <div className="rb-editor">
      <div className="rb-editor-statusbar">
        <span className={`rb-editor-status rb-editor-status--${state}`}>
          {state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "dirty" ? "unsaved" : "—"}
        </span>
        <span className="rb-editor-hint">⌘S to save</span>
      </div>
      <div className="rb-editor-split">
        <div className="rb-editor-pane rb-editor-pane--edit">
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
        <div className="rb-editor-pane rb-editor-pane--preview">
          <div className="rb-content">{previewRender(content)}</div>
        </div>
      </div>
    </div>
  );
}
