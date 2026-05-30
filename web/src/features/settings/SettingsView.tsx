import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth/AuthProvider";
import { changePassword } from "@/lib/data-source/api";
import { SUPPORTED_LANGS, type Lang } from "@/i18n";

export type SettingsCategory = "appearance" | "account";

const KNOWN_CATEGORIES: SettingsCategory[] = ["appearance", "account"];

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
