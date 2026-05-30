import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth/AuthProvider";

const UserIcon = (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="9" cy="6" r="3" />
    <path d="M3.5 15c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" />
  </svg>
);
const LockIcon = (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="7.5" width="11" height="7.5" rx="1.4" />
    <path d="M5.5 7.5V5.5a3.5 3.5 0 0 1 7 0v2" />
  </svg>
);

// Full-screen login gate. Background echoes the topology map (dot grid +
// accent glow) so the login screen feels part of the product.
export function LoginOverlay() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await login(username, password);
    } catch (ex: any) {
      setErr(ex?.status === 429 ? t("auth.tooManyAttempts") : t("auth.invalid"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-glow" aria-hidden />
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <div className="login-mark" />
          <div className="login-brand-name">homelab.</div>
          <div className="login-brand-sub">control plane</div>
        </div>

        <div className="login-fields">
          <label className="login-field">
            <span className="login-field-icon">{UserIcon}</span>
            <input
              className="login-field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("auth.username")}
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className="login-field">
            <span className="login-field-icon">{LockIcon}</span>
            <input
              className="login-field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.password")}
              autoComplete="current-password"
            />
          </label>
        </div>

        {err && <div className="login-err">{err}</div>}

        <button className="login-submit" type="submit" disabled={busy || !username || !password}>
          {busy ? "…" : t("auth.signIn")}
        </button>
      </form>
    </div>
  );
}
