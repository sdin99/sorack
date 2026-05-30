import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMe, login as apiLogin, logout as apiLogout, setUnauthorizedHandler } from "@/lib/data-source/api";

type Status = "loading" | "authed" | "anon";

interface AuthState {
  status: Status;
  username?: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false, staleTime: 60_000 });

  // A 401 from any data call flips us back to anon by refetching "me".
  useEffect(() => {
    setUnauthorizedHandler(() => { qc.invalidateQueries({ queryKey: ["me"] }); });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    status: me.isLoading ? "loading" : me.data ? "authed" : "anon",
    username: me.data?.user.username,
    login: async (username, password) => {
      await apiLogin(username, password);
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
    logout: async () => {
      await apiLogout();
      // Flip to anon synchronously: set "me" to null (status → anon → the
      // gate swaps to LoginOverlay this render). Then drop every OTHER
      // cached query so a different user can't see stale data. We must not
      // clear()/remove the "me" query itself — that would reset the
      // observer and the gate wouldn't re-render until a refetch.
      qc.setQueryData(["me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
  }), [me.isLoading, me.data, qc]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
