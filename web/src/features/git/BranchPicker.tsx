// Branch list + create + switch for the Settings → Runbook → Git
// panel. Renders inside that panel so it shares the same surface as
// Pull / Commit & Push; not used in the runbook header (branch
// switching is rare enough that it doesn't need to live on the
// editing surface).
//
// Workflow:
//   - list  : current branch + every local/remote branch the API knows
//   - switch: click a row → POST /api/git/checkout (server moves HEAD
//             and updates cfg.branch so subsequent pulls/pushes target
//             the new ref)
//   - create: type + Create → POST /api/git/branches, then immediately
//             switch to the new branch
//
// Refuses every write while the working tree is dirty — matches the
// server-side guard so we can't accidentally land a destructive
// checkout from the UI.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSorack } from "@/lib/data-source/SorackData";
import {
  fetchGitBranches,
  gitCheckoutBranch,
  gitCreateBranch,
} from "@/lib/data-source/api";

export function BranchPicker() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { gitStatus } = useSorack();
  const dirty = gitStatus?.dirty ?? 0;
  const locked = dirty > 0;
  const q = useQuery({
    queryKey: ["git-branches"],
    queryFn: fetchGitBranches,
    enabled: Boolean(gitStatus?.configured && gitStatus?.repo),
  });
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string>(""); // "create" | "<branch>" | ""
  const [msg, setMsg] = useState<string>("");

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["git-branches"] }),
      qc.invalidateQueries({ queryKey: ["git-status"] }),
      qc.invalidateQueries({ queryKey: ["git-config"] }),
    ]);
  };

  const doSwitch = async (name: string) => {
    if (locked || busy || name === q.data?.current) return;
    setBusy(name); setMsg("");
    try {
      const r = await gitCheckoutBranch(name);
      if (!r.ok) setMsg(r.reason);
      await refresh();
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setBusy("");
      setTimeout(() => setMsg(""), 5000);
    }
  };

  const doCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || locked || busy) return;
    setBusy("create"); setMsg("");
    try {
      const c = await gitCreateBranch(name);
      if (!c.ok) { setMsg(c.reason); return; }
      const r = await gitCheckoutBranch(name);
      if (!r.ok) setMsg(r.reason);
      else setNewName("");
      await refresh();
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setBusy("");
      setTimeout(() => setMsg(""), 5000);
    }
  };

  return (
    <div className="settings-subcard">
      <div className="settings-subcard-title">{t("git.branchSection", { defaultValue: "branches" })}</div>

      <div className="git-branch-list">
        {q.isLoading ? (
          <div className="settings-field-hint">…</div>
        ) : q.isError ? (
          <div className="settings-err">{String((q.error as any)?.message ?? q.error)}</div>
        ) : !q.data || q.data.branches.length === 0 ? (
          <div className="settings-field-hint">{t("git.noBranches", { defaultValue: "no branches yet — make a commit first" })}</div>
        ) : q.data.branches.map((b) => {
          const isCurrent = b === q.data!.current;
          const isBusy = busy === b;
          return (
            <button
              key={b}
              type="button"
              className={`git-branch-row ${isCurrent ? "git-branch-row--current" : ""}`}
              onClick={() => doSwitch(b)}
              disabled={locked || Boolean(busy) || isCurrent}
              title={locked ? t("git.pullBlockedDirty") : isCurrent ? t("git.currentBranch", { defaultValue: "current branch" }) : t("git.switchTo", { name: b, defaultValue: `switch to ${b}` })}
            >
              <span className="git-branch-glyph">{isCurrent ? "●" : "○"}</span>
              <span className="git-branch-name">{b}</span>
              {isBusy && <span className="git-branch-busy">…</span>}
            </button>
          );
        })}
      </div>

      <form className="git-branch-create" onSubmit={doCreate}>
        <input
          className="settings-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("git.newBranchPlaceholder", { defaultValue: "new-branch-name" })}
          disabled={locked || Boolean(busy)}
        />
        <button
          type="submit"
          className="settings-btn settings-btn--primary"
          disabled={locked || Boolean(busy) || !newName.trim()}
        >{busy === "create" ? "…" : t("git.createBranch", { defaultValue: "create" })}</button>
      </form>

      {locked && <div className="settings-field-hint">{t("git.pullBlockedDirty")}</div>}
      {msg && <div className="settings-err">{msg}</div>}
    </div>
  );
}
