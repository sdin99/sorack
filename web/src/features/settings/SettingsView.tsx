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
  listApiKeys,
  createApiKey,
  revokeApiKey,
  type ApiKey,
} from "@/lib/data-source/api";
import { useSorack } from "@/lib/data-source/SorackData";
import { CommitPushModal } from "@/features/git/CommitPushModal";
import { useGitActions } from "@/features/git/use-git-actions";
import { BranchPicker } from "@/features/git/BranchPicker";
import { SUPPORTED_LANGS, type Lang } from "@/i18n";

export type SettingsCategory = "appearance" | "account" | "runbook" | "api-keys";

const KNOWN_CATEGORIES: SettingsCategory[] = ["appearance", "account", "runbook", "api-keys"];

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
    { key: "api-keys", label: t("settings.apiKeys.nav", { defaultValue: "API keys" }) },
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
          {cat === "api-keys" && <ApiKeysPanel />}
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

      <BranchPicker />

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

// Git personal access token. Deliberately still "token": this is GitHub's
// own word for it, and calling it an API key here would send someone
// looking for one in GitHub's settings, where no such thing exists. Our
// own credentials are API keys; this one is a token because GitHub says so.
//
// Writes are one-way (we never read the token back to the UI). Shows
// "(set)" if a value already exists server-side and the user has not typed
// a new one yet.
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

// ── API keys ─────────────────────────────────────────────────────────
// For callers that are not a person with a browser: sync scripts,
// reconcilers, other tools. Issued here because a key must not be able to
// mint another one — otherwise revoking the key you know about does not
// actually revoke access.
//
// The copy here follows web/src/i18n/README.md. It used to be one paragraph
// answering three questions (how to send it, what the scopes mean, whether
// it expires), which meant someone looking for one of the three had to read
// all three. Each answer now sits where its question is asked.
function ApiKeysPanel() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Held in state, never re-fetchable: the server stores only a hash.
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null);

  const reload = () => { listApiKeys().then(setKeys).catch(() => setKeys([])); };
  useEffect(reload, []);

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await createApiKey(name.trim(), scope);
      setIssued({ name: r.name, key: r.key });
      setName("");
      reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    try { await revokeApiKey(id); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-title">{t("settings.apiKeys.title", { defaultValue: "API keys" })}</div>
      <p className="settings-field-hint">
        {t("settings.apiKeys.intro", {
          defaultValue: "Credentials for callers that are not a person: sync scripts, reconcilers.",
        })}
      </p>

      {issued && (
        <div className="settings-subcard settings-key-issued">
          <div className="settings-subcard-title">
            {t("settings.apiKeys.issued", { defaultValue: "Copy this now — it is not shown again" })}
          </div>
          <code className="settings-key-value">{issued.key}</code>
          <div className="settings-key-header">
            <span className="settings-key-header-label">
              {t("settings.apiKeys.headerLabel", { defaultValue: "header" })}
            </span>
            {/* Not translated: this is the literal text that goes on the
                wire, so localising the placeholder would only invite someone
                to type it. */}
            <code>Authorization: Bearer &lt;key&gt;</code>
          </div>
          <button className="settings-btn" onClick={() => setIssued(null)}>
            {t("action.close", { defaultValue: "Close" })}
          </button>
        </div>
      )}

      <div className="settings-subcard">
        <div className="settings-subcard-title">{t("settings.apiKeys.new", { defaultValue: "New key" })}</div>
        <label className="settings-field">
          <span className="settings-input-label">{t("settings.apiKeys.name", { defaultValue: "name" })}</span>
          <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.apiKeys.namePlaceholder", { defaultValue: "e.g. topology-sync" })} />
        </label>
        <label className="settings-field">
          <span className="settings-input-label">{t("settings.apiKeys.scope", { defaultValue: "scope" })}</span>
          <select className="settings-input" value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")}>
            <option value="read">read</option>
            <option value="write">write</option>
          </select>
          <span className="settings-field-hint">
            {t("settings.apiKeys.scopeHint", { defaultValue: "read = GET only · write = any change" })}
          </span>
        </label>
        <button className="settings-btn" disabled={busy || !name.trim()} onClick={create}>
          {t("settings.apiKeys.create", { defaultValue: "Create" })}
        </button>
        {err && <div className="settings-err">{err}</div>}
      </div>

      {keys.length > 0 && (
        <div className="settings-subcard">
          <div className="settings-subcard-title">{t("settings.apiKeys.existing", { defaultValue: "Issued" })}</div>
          <span className="settings-field-hint">
            {t("settings.apiKeys.existingHint", { defaultValue: "No expiry · revoking cuts access at once" })}
          </span>
          {keys.map((k) => (
            <div key={k.id} className="settings-key-row">
              <span className="settings-key-name">{k.name}</span>
              <span className="settings-key-scope">{k.scope}</span>
              <span className="settings-key-used">
                {k.lastUsedAt
                  ? t("settings.apiKeys.lastUsed", { date: new Date(k.lastUsedAt).toLocaleString(), defaultValue: "last used {{date}}" })
                  : t("settings.apiKeys.neverUsed", { defaultValue: "never used" })}
              </span>
              <button className="settings-btn" onClick={() => revoke(k.id)}>
                {t("settings.apiKeys.revoke", { defaultValue: "Revoke" })}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
