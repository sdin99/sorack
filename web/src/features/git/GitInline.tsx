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
import { useSorack } from "@/lib/data-source/SorackData";
import { CommitPushModal } from "./CommitPushModal";
import { useGitActions } from "./use-git-actions";

export function GitInline() {
  const { t } = useTranslation();
  const { gitStatus } = useSorack();
  const { pulling, pullMsg, pull } = useGitActions();
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
          onClick={pull}
          disabled={pulling || dirty > 0}
          title={dirty > 0 ? t("git.pullBlockedDirty", { defaultValue: "commit pending changes first" }) : t("git.pull")}
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
