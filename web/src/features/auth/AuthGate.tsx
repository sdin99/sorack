import { BrowserRouter } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SorackDataProvider } from "@/lib/data-source/SorackData";
import { App } from "@/App";
import { LoginOverlay } from "./LoginOverlay";

// Decides what the app shows based on auth status. Data providers/queries
// only mount once authenticated, so an anonymous visitor never fires the
// inventory/runbooks/alerts calls (no 401 flood, no flicker). The router
// also lives under the gate — deep-link URLs are only routable for signed-in
// users, and the anon LoginOverlay never sees a router context.
export function AuthGate() {
  const { status } = useAuth();
  if (status === "loading") return (
    <div className="auth-splash">
      <div className="auth-spinner" aria-hidden="true" />
    </div>
  );
  if (status === "anon") return <LoginOverlay />;
  return (
    <SorackDataProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SorackDataProvider>
  );
}
