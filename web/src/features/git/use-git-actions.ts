// Shared pull state + handler. Both the Settings → Runbook panel and
// the runbook-screen GitInline bar need the same fetch/error/timeout
// dance around POST /api/git/pull; this hook is the single owner so the
// two UIs can't drift. (Commit & Push state lives inside its own modal,
// so it doesn't need to ride along here.)

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { gitAdopt, gitPull } from "@/lib/data-source/api";

export interface GitActions {
  pulling: boolean;
  pullMsg: string;
  pull: () => Promise<void>;
  adopt: () => Promise<void>;
}

export function useGitActions(): GitActions {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState("");

  const pull = async () => {
    setPulling(true);
    setPullMsg("");
    try {
      const r = await gitPull();
      setPullMsg(r.ok ? t("git.pullOk") : t("git.pullErr", { reason: r.reason }));
    } catch (ex: any) {
      setPullMsg(t("git.pullErr", { reason: String(ex?.message ?? ex) }));
    } finally {
      setPulling(false);
      qc.invalidateQueries({ queryKey: ["git-status"] });
      // Auto-fade so the inline header doesn't keep a stale message
      // pinned indefinitely.
      setTimeout(() => setPullMsg(""), 4000);
    }
  };

  // Adopt: only offered when the directory has content, a remote is set and
  // it is not a repo yet. Shares pullMsg so the panel has one message line
  // rather than two competing for the same corner.
  const adopt = async () => {
    setPulling(true);
    setPullMsg("");
    try {
      const r = await gitAdopt();
      if (r.ok) {
        setPullMsg(t("git.adoptOk", {
          count: r.filesCommitted,
          defaultValue: r.merged
            ? "Adopted and merged with the remote ({{count}} file(s))"
            : "Adopted ({{count}} file(s))",
        }));
      } else if (r.conflicts?.length) {
        // Name the files. "Conflict" on its own leaves the user to go and
        // find out which, and they cannot see the remote from here.
        setPullMsg(t("git.adoptConflict", {
          files: r.conflicts.join(", "),
          defaultValue: "The remote already has: {{files}}. Rename one side and try again.",
        }));
      } else {
        setPullMsg(t("git.adoptErr", { reason: r.reason, defaultValue: "Could not adopt: {{reason}}" }));
      }
    } catch (ex: any) {
      setPullMsg(t("git.adoptErr", { reason: String(ex?.message ?? ex), defaultValue: "Could not adopt: {{reason}}" }));
    } finally {
      setPulling(false);
      qc.invalidateQueries({ queryKey: ["git-status"] });
      // Longer than pull's 4s: a conflict message names files the user has
      // to act on, and four seconds is not long enough to read and copy them.
      setTimeout(() => setPullMsg(""), 15000);
    }
  };

  return { pulling, pullMsg, pull, adopt };
}
