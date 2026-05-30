import { QueryClient } from "@tanstack/react-query";

// Single shared client for both auth (the "me" query) and app data, so
// logout's queryClient.clear() and 401 invalidations reach everything.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchOnWindowFocus: false },
  },
});
