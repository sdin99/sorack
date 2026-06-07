import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  changePassword,
  fetchGitConfig,
  updateGitConfig,
  type GitConfigView,
  type GitFieldSource,
} from "@/lib/data-source/api";
import { useSorack } from "@/lib/data-source/SorackData";
import { CommitPushModal } from "@/features/git/CommitPushModal";
import { useGitActions } from "@/features/git/use-git-actions";
import { SUPPORTED_LANGS, type Lang } from "@/i18n";

export type SettingsCategory = "appearance" | "account" | "runbook";

const KNOWN_CATEGORIES: SettingsCategory[] = ["appearance", "account", "runbook"];

interface Props {
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  // The active category is owned by the URL (`/settings/:category`),
  // so the parent (router wrapper) feeds it in and gets a callback
  // when the user clicks another category.
  category: SettingsCategory;
  onCategoryChange: (c: SettingsCategory) => void;
  onClose: () => void;
}

// Grafana-style settings: fills the main (map) pane rather than a modal.
// Left rail picks a category; the panel on the right shows its fields.
export function SettingsView({ theme, setTheme, category, onCategoryChange, onClose }: Props) {
  const { t } = useTranslation();
  // Unknown category in the URL falls back to appearance — easier than a
  // route guard, and means typoed deep links still land somewhere useful.
  const cat: SettingsCategory = KNOWN_CATEGORIES.includes(category) ? category : "appearance";

  const cats: { key: SettingsCategory; label: string }[] = [
    { key: "appearance", label: t("settings.appearance") },
    { key: "account", label: t("settings.account") },
    { key: "runbook", label: t("settings.runbook") },
  ];

  return (
    <div className="settings-view">
      <header className="settings-topbar">
        <div className="settings-topbar-title">{t("settings.title")}</div>
        <button className="settings-close" onClick={onClose} aria-label={t("action.close")}>✕</button>
      </header>
      <div className="settings-shell">
        <nav className="settings-nav">
          {cats.map((c) => (
            <button
              key={c.key}
              className={`settings-nav-item ${cat === c.key ? "settings-nav-item--on" : ""}`}
              onClick={() => onCategoryChange(c.key)}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {cat === "appearance" && <AppearancePanel theme={theme} setTheme={setTheme} />}
          {cat === "account" && <AccountPanel />}
          {cat === "runbook" && <RunbookPanel />}
        </div>
      </div>
    </div>
  );
}

// ── Appearance ───────────────────────────────────────────────────────
function AppearancePanel({ theme, setTheme }: { theme: "dark" | "light"; setTheme: (t: "dark" | "light") => void }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || "en").slice(0, 2) as Lang;

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">{t("settings.appearance")}</h2>

      <div className="settings-field">
        <div className="settings-field-text">
          <div className="settings-field-label">{t("settings.theme")}</div>
          <div className="settings-field-hint">{t("settings.themeHint")}</div>
        </div>
        <div className="settings-seg">
          <button className={`settings-seg-btn ${theme === "light" ? "settings-seg-btn--on" : ""}`} onClick={() => setTheme("light")}>
            {t("settings.themeLight")}
          </button>
          <button className={`settings-seg-btn ${theme === "dark" ? "settings-seg-btn--on" : ""}`} onClick={() => setTheme("dark")}>
            {t("settings.themeDark")}
          </button>
        </div>
      </div>

      <div className="settings-field">
        <div className="settings-field-text">
          <div className="settings-field-label">{t("lang.label")}</div>
          <div className="settings-field-hint">{t("settings.langHint")}</div>
        </div>
        <div className="settings-select-wrap">
          <select
            className="settings-select"
            value={lang}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            {SUPPORTED_LANGS.map((lng) => (
              <option key={lng} value={lng}>{t(`lang.${lng}`)}</option>
            ))}
          </select>
          <span className="settings-select-chev">▾</span>
        </div>
      </div>
    </section>
  );
}

// ── Account ──────────────────────────────────────────────────────────
function AccountPanel() {
  const { t } = useTranslation();
  const { username, logout } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok">("idle");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (next !== confirm) { setErr(t("settings.passwordMismatch")); return; }
    setState("busy");
    try {
      await changePassword(cur, next);
      setState("ok");
      setCur(""); setNext(""); setConfirm("");
      setTimeout(() => setState("idle"), 2500);
    } catch (ex: any) {
      setState("idle");
      setErr(ex?.status === 400 ? t("settings.passwordTooShort") : t("settings.currentWrong"));
    }
  };

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">{t("settings.account")}</h2>

      <div className="settings-field">
        <div className="settings-field-text">
          <div className="settings-field-label">{t("auth.username")}</div>
        </div>
        <div className="settings-field-value">{username}</div>
      </div>

      <form className="settings-subcard" onSubmit={submit}>
        <div className="settings-subcard-title">{t("settings.changePassword")}</div>
        <label className="settings-input-row">
          <span className="settings-input-label">{t("settings.currentPassword")}</span>
          <input className="settings-input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </label>
        <label className="settings-input-row">
          <span className="settings-input-label">{t("settings.newPassword")}</span>
          <input className="settings-input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="settings-input-row">
          <span className="settings-input-label">{t("settings.confirmPassword")}</span>
          <input className="settings-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {err && <div className="settings-err">{err}</div>}
        {state === "ok" && <div className="settings-ok">{t("settings.passwordChanged")}</div>}
        <div className="settings-subcard-actions">
          <button className="settings-btn settings-btn--primary" type="submit" disabled={state === "busy" || !cur || !next || !confirm}>
            {state === "busy" ? "…" : t("settings.changePassword")}
          </button>
        </div>
      </form>

      <button className="settings-signout" onClick={() => logout()}>{t("auth.signOut")}</button>
    </section>
  );
}

// ── Runbook ─────────────────────────────────────────────────────────
// Wrapper panel for all runbook-related settings. v1 only has one
// section (Storage = local-file vs git-sync), but keeping it as its own
// category leaves room for retention / template-source / attachment
// settings without piling onto Appearance or Account.
function RunbookPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["git-config"], queryFn: fetchGitConfig });
  const enabled = cfgQ.data?.enabled ?? false;
  const envPinnedMode = cfgQ.data?.source.enabled === "env";

  const setMode = async (next: boolean) => {
    if (envPinnedMode || next === enabled) return;
    // Optimistic: flip the cached enabled immediately so the segmented
    // toggle (and the conditional GitPanel mount below) react in one
    // frame instead of waiting for the PATCH + refetch round-trip
    // (~1.5s on dev). On failure we roll back to the prior snapshot.
    //
    // cancelQueries first — without it, a still-in-flight initial fetch
    // (or anyone else's fetch on this key) lands AFTER our setQueryData
    // and stomps the optimistic value, producing a visible "git → local
    // → git" flicker before the invalidate's refetch catches up.
    await qc.cancelQueries({ queryKey: ["git-config"] });
    const prev = qc.getQueryData<typeof cfgQ.data>(["git-config"]);
    if (prev) qc.setQueryData(["git-config"], { ...prev, enabled: next });
    try {
      await updateGitConfig({ enabled: next });
    } catch (e) {
      if (prev) qc.setQueryData(["git-config"], prev);
      return;
    }
    qc.invalidateQueries({ queryKey: ["git-config"] });
    qc.invalidateQueries({ queryKey: ["git-status"] });
  };

  return (
    <section className="settings-panel">
      <h2 className="settings-panel-title">{t("settings.runbook")}</h2>

      <div className="settings-field">
        <div className="settings-field-text">
          <div className="settings-field-label">
            {t("runbook.storageMode")}
            {envPinnedMode && <span className="settings-env-pin"> (env)</span>}
          </div>
          <div className="settings-field-hint">
            {enabled ? t("runbook.storageGitHint") : t("runbook.storageLocalHint")}
          </div>
        </div>
        <div className="settings-seg">
          <button
            className={`settings-seg-btn ${!enabled ? "settings-seg-btn--on" : ""}`}
            onClick={() => setMode(false)}
            disabled={envPinnedMode}
          >{t("runbook.storageLocal")}</button>
          <button
            className={`settings-seg-btn ${enabled ? "settings-seg-btn--on" : ""}`}
            onClick={() => setMode(true)}
            disabled={envPinnedMode}
          >{t("runbook.storageGit")}</button>
        </div>
      </div>

      {enabled && <GitPanel />}
    </section>
  );
}

// ── Git (Storage = Git sync) ────────────────────────────────────────
// Status (clean / dirty N / ahead / behind / last fetch) + config form.
// Env-pinned fields render read-only with a "(env)" hint so an operator
// understands why they can't change the value from the UI. Nested
// inside RunbookPanel — git is one storage mechanism, not its own
// top-level category.
function GitPanel() {
  const { t } = useTranslation();
  const { gitStatus } = useSorack();
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["git-config"], queryFn: fetchGitConfig });
  const [draft, setDraft] = useState<GitConfigView | null>(null);
  const [tokenDraft, setTokenDraft] = useState<string>("");
  const [savingState, setSavingState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [saveErr, setSaveErr] = useState<string>("");
  const { pulling, pullMsg, pull } = useGitActions();
  const [commitOpen, setCommitOpen] = useState(false);

  // Mirror server state into the form once on first load (and again when
  // the user discards). After that the form owns its draft.
  useEffect(() => {
    if (cfgQ.data && !draft) setDraft(cfgQ.data);
  }, [cfgQ.data, draft]);

  if (!cfgQ.data || !draft) {
    return <div className="settings-field-hint">…</div>;
  }

  const src = draft.source;
  const isEnv = (k: keyof typeof src): boolean => src[k] === "env";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr("");
    setSavingState("busy");
    try {
      const patch: any = {};
      // Only send fields the user actually owns (UI side); env-pinned
      // fields are skipped both here and server-side.
      if (!isEnv("remote")) patch.remote = draft.remote || null;
      if (!isEnv("branch")) patch.branch = draft.branch || null;
      if (!isEnv("username")) patch.username = draft.username || null;
      if (!isEnv("authorName")) patch.authorName = draft.authorName || null;
      if (!isEnv("authorEmail")) patch.authorEmail = draft.authorEmail || null;
      // Token only if user typed a new value; empty string clears it.
      if (!isEnv("token") && tokenDraft) patch.token = tokenDraft;
      await updateGitConfig(patch);
      setTokenDraft("");
      await qc.invalidateQueries({ queryKey: ["git-config"] });
      await qc.invalidateQueries({ queryKey: ["git-status"] });
      setSavingState("ok");
      setTimeout(() => setSavingState("idle"), 2000);
    } catch (ex: any) {
      setSaveErr(String(ex?.message ?? ex));
      setSavingState("err");
    }
  };

  const statusLabel = (() => {
    if (!gitStatus) return "…";
    if (!gitStatus.configured) return t("git.notConfigured");
    if (!gitStatus.repo) return t("git.notRepo");
    const parts: string[] = [];
    if (gitStatus.dirty > 0) parts.push(t("git.dirtyN", { count: gitStatus.dirty }));
    if (gitStatus.ahead > 0) parts.push(t("git.aheadN", { count: gitStatus.ahead }));
    if (gitStatus.behind > 0) parts.push(t("git.behindN", { count: gitStatus.behind }));
    if (parts.length === 0) return t("git.clean");
    return parts.join(" · ");
  })();

  return (
    <>
      <div className="settings-subcard">
        <div className="settings-subcard-title">{t("git.status")}</div>
        <div className="settings-field">
          <div className="settings-field-text">
            <div className="settings-field-label">{t("git.state")}</div>
            <div className="settings-field-hint">
              {gitStatus?.branch ? `branch: ${gitStatus.branch}` : ""}
              {gitStatus?.lastFetchAt ? ` · last fetch: ${new Date(gitStatus.lastFetchAt).toLocaleString()}` : ""}
            </div>
          </div>
          <div className="settings-field-value">{statusLabel}</div>
        </div>
        {gitStatus?.error && <div className="settings-err">{gitStatus.error}</div>}
        <div className="settings-subcard-actions">
          <button
            className="settings-btn"
            onClick={pull}
            disabled={pulling || !gitStatus?.configured || !gitStatus?.repo || (gitStatus?.dirty ?? 0) > 0}
            title={(gitStatus?.dirty ?? 0) > 0 ? t("git.pullBlockedDirty") : undefined}
          >{pulling ? "…" : t("git.pull")}</button>
          <button
            className="settings-btn settings-btn--primary"
            onClick={() => setCommitOpen(true)}
            disabled={!gitStatus?.configured || !gitStatus?.repo || (gitStatus?.dirty ?? 0) === 0}
          >{t("git.commitAndPush")}</button>
        </div>
        {pullMsg && <div className="settings-field-hint">{pullMsg}</div>}
      </div>

      <form className="settings-subcard" onSubmit={submit}>
        <div className="settings-subcard-title">{t("git.config")}</div>

        <GitField
          label={t("git.remote")} hint={t("git.remoteHint")}
          value={draft.remote} src={src.remote}
          onChange={(v) => setDraft({ ...draft, remote: v })}
          placeholder="https://github.com/user/repo.git"
        />
        <GitField
          label={t("git.branch")} value={draft.branch} src={src.branch}
          onChange={(v) => setDraft({ ...draft, branch: v })}
          placeholder="main"
        />
        <GitField
          label={t("git.username")} hint={t("git.usernameHint")}
          value={draft.username} src={src.username}
          onChange={(v) => setDraft({ ...draft, username: v })}
          placeholder="x-access-token"
        />
        <GitTokenField
          label={t("git.token")} hint={t("git.tokenHint")}
          src={src.token} hasValue={draft.tokenSet}
          value={tokenDraft} onChange={setTokenDraft}
        />
        <GitField
          label={t("git.authorName")} value={draft.authorName} src={src.authorName}
          onChange={(v) => setDraft({ ...draft, authorName: v })}
          placeholder="sorack"
        />
        <GitField
          label={t("git.authorEmail")} value={draft.authorEmail} src={src.authorEmail}
          onChange={(v) => setDraft({ ...draft, authorEmail: v })}
          placeholder="sorack@localhost"
        />

        {saveErr && <div className="settings-err">{saveErr}</div>}
        {savingState === "ok" && <div className="settings-ok">{t("git.saved")}</div>}
        <div className="settings-subcard-actions">
          <button
            type="submit"
            className="settings-btn settings-btn--primary"
            disabled={savingState === "busy"}
          >{savingState === "busy" ? "…" : t("git.save")}</button>
        </div>
      </form>

      {commitOpen && <CommitPushModal onClose={() => setCommitOpen(false)} />}
    </>
  );
}

// Reusable form row. Env-pinned fields render as a disabled input with
// the value greyed out and an "(env)" tag in the hint line.
function GitField({
  label, hint, value, src, onChange, placeholder,
}: {
  label: string; hint?: string;
  value: string; src: GitFieldSource;
  onChange: (v: string) => void; placeholder?: string;
}) {
  const envPinned = src === "env";
  return (
    <label className="settings-input-row">
      <span className="settings-input-label">
        {label}
        {envPinned && <span className="settings-env-pin"> (env)</span>}
      </span>
      <input
        className="settings-input"
        value={envPinned ? "•••• (env)" : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={envPinned}
        placeholder={placeholder}
      />
      {hint && <span className="settings-field-hint">{hint}</span>}
    </label>
  );
}

// Token row: writes are one-way (we never read the token back to the
// UI). Shows "(set)" if a value already exists server-side and the user
// hasn't typed a new one yet.
function GitTokenField({
  label, hint, src, hasValue, value, onChange,
}: {
  label: string; hint?: string;
  src: GitFieldSource; hasValue: boolean;
  value: string; onChange: (v: string) => void;
}) {
  const envPinned = src === "env";
  return (
    <label className="settings-input-row">
      <span className="settings-input-label">
        {label}
        {envPinned && <span className="settings-env-pin"> (env)</span>}
        {!envPinned && hasValue && !value && <span className="settings-env-pin"> (set)</span>}
      </span>
      <input
        type="password"
        autoComplete="new-password"
        className="settings-input"
        value={envPinned ? "•••• (env)" : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={envPinned}
        placeholder={envPinned ? "" : hasValue ? "•••• (set — replace by typing)" : "ghp_…"}
      />
      {hint && <span className="settings-field-hint">{hint}</span>}
    </label>
  );
}

// CommitPushModal moved to @/features/git/CommitPushModal — also used by
// the runbook-screen inline git actions.
