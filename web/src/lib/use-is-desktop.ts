import { useEffect, useState } from "react";

const QUERY = "(min-width: 1024px)";

export function useIsDesktop(): boolean {
  const [v, setV] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false,
  );
  useEffect(() => {
    const m = window.matchMedia(QUERY);
    const h = (e: MediaQueryListEvent) => setV(e.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return v;
}
