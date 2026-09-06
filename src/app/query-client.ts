import { MutationCache, QueryClient, defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import i18n from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import { logger } from "@/shared/lib/logger";
import { displayMessage } from "@/shared/lib/user-facing-error";
import { errorMessage } from "@/shared/lib/errors";
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

// Lets a specific useMutation()/useInvalidatingMutation() call opt out of
// the app-wide error toast below — for the handful of call sites that
// already render their own, more specific success/failure feedback (a
// batched action reporting one aggregate count, for instance) and would
// otherwise show two toasts for the same failure.
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      suppressErrorToast?: boolean;
    };
  }
}

// Extracted so it's unit-testable against a plain shaped object (see
// query-client.test.ts) without spinning up a real QueryClient/Mutation —
// the same reasoning as shouldDehydrateQuery above.
export function handleMutationError(
  error: unknown,
  mutation: { options: { meta?: { suppressErrorToast?: boolean } } }
): void {
  logger.error(`Mutation failed: ${errorMessage(error)}`);
  if (mutation.options.meta?.suppressErrorToast) return;
  toast({ description: displayMessage(error, i18n.t("errors.actionFailed")), variant: "error" });
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
  // Every mutation in the app funnels through here on failure — see
  // docs/architecture.md and CLAUDE.md's rule that a user-triggered action
  // must never fail silently. Individual call sites no longer need their
  // own generic "something went wrong" catch/toast; this is the one place
  // that guarantees it happens.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => handleMutationError(error, mutation),
  }),
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
