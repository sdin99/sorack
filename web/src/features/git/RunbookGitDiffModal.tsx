// Working-tree-vs-HEAD diff for a single runbook. Server returns the
// raw `{head, working}` strings; we run `diffLines` here so the same
// unified-diff renderer the conflict banner uses keeps a single visual
// vocabulary across the app.
//
// base = HEAD (last commit), head = working tree (current disk). `-`
// lines are what HEAD has and would disappear if HEAD were rewritten to
// match disk; `+` lines are what disk has on top of HEAD.

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { diffLines } from "diff";
import { fetchRunbookGitDiff } from "@/lib/data-source/api";

export function RunbookGitDiffModal({
  runbookId,
  title,
  onClose,
}: {
  runbookId: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["git-diff", runbookId],
    queryFn: () => fetchRunbookGitDiff(runbookId),
    // The modal is short-lived; refetch on open to capture any in-flight
    // chokidar churn, but skip the noisy background polling.
    staleTime: 0,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [onClose]);

  const [lines, hasChanges] = useMemo<[Array<{ kind: "add" | "del" | "ctx"; text: string; key: string }>, boolean]>(() => {
    if (!q.data) return [[], false];
    const parts = diffLines(q.data.head ?? "", q.data.working ?? "");
    const out: Array<{ kind: "add" | "del" | "ctx"; text: string; key: string }> = [];
    parts.forEach((part, pi) => {
      const kind: "add" | "del" | "ctx" = part.added ? "add" : part.removed ? "del" : "ctx";
      const raw = part.value.split("\n");
      if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
      raw.forEach((line, li) => out.push({ kind, text: line, key: `${pi}-${li}` }));
    });
    return [out, out.some((l) => l.kind !== "ctx")];
  }, [q.data]);

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
          <button
            className="rb-diff-close"
            onClick={onClose}
            aria-label={t("action.close")}
            title={t("action.close")}
          >✕</button>
        </div>
        <div className="rb-diff-body">
          {q.isLoading ? (
            <div className="rb-diff-empty">…</div>
          ) : q.isError ? (
            <div className="rb-diff-empty">{String((q.error as any)?.message ?? q.error)}</div>
          ) : !hasChanges ? (
            <div className="rb-diff-empty">{t("runbook.conflict.diffEmpty")}</div>
          ) : (
            lines.map((l) => (
              <div key={l.key} className={`rb-diff-line rb-diff-line--${l.kind}`}>
                <span className="rb-diff-prefix">
                  {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
                </span>
                <span className="rb-diff-text">{l.text || " "}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
