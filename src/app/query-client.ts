import { QueryClient } from "@tanstack/react-query";
// `local.*` (SQLite-backed) queries used to also be persisted to
// localStorage for up to 7 days as an instant-cold-start cache — removed
// because it duplicated library/history/notes/preferences in a
// second, less-protected storage location the webview's own JavaScript can
// read, undermining the local-first privacy story for a purely cosmetic
// win (SQLite reads over Tauri IPC are already fast). Query state now
// lives in memory only, for the lifetime of the app process.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: 1,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "offlineFirst" },
  },
});
