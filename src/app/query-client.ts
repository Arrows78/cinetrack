import { QueryClient, defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { GC_7_DAYS, STALE_5_MIN, STALE_24_HOURS } from "@/shared/constants/query";

// `local.*` (SQLite-backed) queries — library/history/notes/preferences,
// everything scoped to a profile — must NEVER be persisted outside SQLite:
// duplicating them into localStorage would put personal data in a second,
// less-protected storage location the webview's own JavaScript can read,
// undermining the app's local-first privacy story. `local.*` therefore
// stays memory-only, for the lifetime of the app process, exactly as
// before.
//
// `remote.*` queries are the TMDB catalogue (movies/series metadata,
// images, search, discover, …) — a public, non-sensitive dataset — so
// re-fetching all of it from scratch on every app launch is a pure UX
// cost with no privacy upside. Those are persisted to localStorage for an
// instant cold start, capped at 24h (catalogue data changes slowly).
//
// `shouldDehydrateQuery` is the hard boundary enforcing this split: only a
// query keyed under `["remote", ...]` (see queryKeys.remote.* in
// query-keys.ts) that also succeeded is ever written to storage.
export function shouldDehydrateQuery(query: Query): boolean {
  return query.queryKey[0] === "remote" && defaultShouldDehydrateQuery(query);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_5_MIN,
      gcTime: GC_7_DAYS,
      retry: 1,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "offlineFirst" },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "cinetrack.remote-cache.v1",
});

void persistQueryClient({
  queryClient,
  persister,
  maxAge: STALE_24_HOURS,
  dehydrateOptions: { shouldDehydrateQuery },
});
