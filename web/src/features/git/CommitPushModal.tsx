// Reusable Commit & Push modal. Used by Settings → Runbook → Git (where
// it sits beside the config form) and by the per-runbook inline action
// bar in the runbook screen header. Backdrop click + Esc + ✕ all close;
// on success it invalidates ["git-status"] so the badge picks up the
// freshly-clean state.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useSorack } from "@/lib/data-source/SorackData";
import { gitCommitPush } from "@/lib/data-source/api";

export function CommitPushModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { gitStatus } = useSorack();
  const [message, setMessage] = useState<string>(
    `update ${gitStatus?.dirty ?? 0} runbook${(gitStatus?.dirty ?? 0) === 1 ? "" : "s"}`,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await gitCommitPush(message.trim());
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["git-status"] });
        onClose();
      } else {
        setErr(r.reason);
      }
    } catch (ex: any) {
      setErr(String(ex?.message ?? ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="git-modal-overlay" onClick={onClose}>
      <form className="git-modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="git-modal-head">
          <span className="git-modal-title">{t("git.commitAndPush")}</span>
          <button
            type="button"
            className="git-modal-close"
            onClick={onClose}
            aria-label={t("action.close")}
          >✕</button>
        </div>
        <div className="git-modal-body">
          <label className="settings-input-row">
            <span className="settings-input-label">{t("git.commitMessage")}</span>
            <input
              className="settings-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          </label>
          <div className="settings-field-hint">
            {gitStatus?.dirty ?? 0} {t("git.filesChanged")}
          </div>
          {err && <div className="settings-err">{err}</div>}
        </div>
        <div className="git-modal-actions">
          <button type="button" className="settings-btn" onClick={onClose}>
            {t("action.cancel")}
          </button>
          <button
            type="submit"
            className="settings-btn settings-btn--primary"
            disabled={busy || !message.trim()}
          >{busy ? "…" : t("git.commitAndPush")}</button>
        </div>
      </form>
    </div>
  );
}
