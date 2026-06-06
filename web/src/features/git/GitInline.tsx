// Inline git status + actions, designed for the runbook-screen header.
// Compact enough to sit in the fs-head row next to the back button and
// title; hidden entirely when git mode is off so non-git users don't see
// a stub bar.
//
// Three pieces, left → right:
//   - status pill  : clean / dirty N / ↑N ↓N / ⚠  (same tones as the
//                    topbar GitBadge so they read as the same control)
//   - Pull         : disabled when behind === 0, swaps to "pulling…"
//                    while in-flight, surfaces failures as a transient
//                    hint below
//   - Commit & Push: disabled when dirty === 0; opens the shared modal
//
// Status query is shared with the topbar via the ["git-status"] cache
// entry, so a successful pull/commit-push from either spot updates both
// in the same React Query invalidate.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useSorack } from "@/lib/data-source/SorackData";
import { gitPull } from "@/lib/data-source/api";
import { CommitPushModal } from "./CommitPushModal";

export function GitInline() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { gitStatus } = useSorack();
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string>("");
  const [commitOpen, setCommitOpen] = useState(false);

  if (!gitStatus || !gitStatus.configured) return null;

  const dirty = gitStatus.dirty ?? 0;
  const ahead = gitStatus.ahead ?? 0;
  const behind = gitStatus.behind ?? 0;
  const hasError = Boolean(gitStatus.error);
  const isClean = !hasError && dirty === 0 && ahead === 0 && behind === 0;
  const tone =
    hasError ? "err" :
    dirty > 0 ? "warn" :
    (ahead > 0 || behind > 0) ? "accent" :
    "clean";

  const statusText =
    hasError ? "⚠" :
    isClean ? t("git.clean") :
    [
      dirty > 0 && t("git.dirtyN", { count: dirty }),
      ahead > 0 && `↑${ahead}`,
      behind > 0 && `↓${behind}`,
    ].filter(Boolean).join(" · ");

  const doPull = async () => {
    setPulling(true); setPullMsg("");
    try {
      const r = await gitPull();
      if (r.ok) {
        setPullMsg(t("git.pullOk"));
      } else {
        setPullMsg(t("git.pullErr", { reason: r.reason }));
      }
    } catch (ex: any) {
      setPullMsg(t("git.pullErr", { reason: String(ex?.message ?? ex) }));
    } finally {
      setPulling(false);
      qc.invalidateQueries({ queryKey: ["git-status"] });
      // Banner auto-fades after a few seconds so it doesn't linger in the
      // header indefinitely.
      setTimeout(() => setPullMsg(""), 4000);
    }
  };

  return (
    <>
      <div className="git-inline" role="group" aria-label="git">
        <span
          className={`git-inline-pill git-inline-pill--${tone}`}
          title={hasError ? (gitStatus.error || "") : statusText}
        >{statusText}</span>
        <button
          type="button"
          className="git-inline-btn"
          onClick={doPull}
          disabled={pulling || behind === 0}
          title={t("git.pull")}
        >{pulling ? "…" : t("git.pull")}</button>
        <button
          type="button"
          className="git-inline-btn git-inline-btn--primary"
          onClick={() => setCommitOpen(true)}
          disabled={dirty === 0}
          title={t("git.commitAndPush")}
        >{t("git.commitAndPush")}</button>
        {pullMsg && <span className="git-inline-msg">{pullMsg}</span>}
      </div>
      {commitOpen && <CommitPushModal onClose={() => setCommitOpen(false)} />}
    </>
  );
}
