// Shared pull state + handler. Both the Settings → Runbook panel and
// the runbook-screen GitInline bar need the same fetch/error/timeout
// dance around POST /api/git/pull; this hook is the single owner so the
// two UIs can't drift. (Commit & Push state lives inside its own modal,
// so it doesn't need to ride along here.)

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { gitPull } from "@/lib/data-source/api";

export interface GitActions {
  pulling: boolean;
  pullMsg: string;
  pull: () => Promise<void>;
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

  return { pulling, pullMsg, pull };
}
