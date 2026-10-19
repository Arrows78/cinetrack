import { useQueryClient } from "@tanstack/react-query";
import { usePreferences } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import type { UserPreferences } from "@/types/media";

// Matches the Rust-side MAX_RECENT_SEARCHES cap (src-tauri/src/preferences/models.rs)
// so a write here can never be rejected by the backend's own validation.
const MAX_RECENT_SEARCHES = 8;

/**
 * Most-recent-first list of past search terms, backing the global search
 * page's autocomplete dropdown — persisted as a preference (no SQLite
 * migration needed, see UserPreferences.recentSearches) rather than a new
 * table, since it's a small device-scoped list, not relational data.
 */
export function useSearchHistory() {
  const queryClient = useQueryClient();
  const { data, setPreference } = usePreferences();
  const recentSearches = data?.recentSearches ?? [];

  // Each write rebuilds the whole list, so it must start from the list as it
  // is *now*: the array captured by this render goes stale as soon as a
  // previous write lands (two searches in quick succession, or one made from a
  // handler created before the first write settled), and saving from it would
  // silently drop the entry just added. The cache is where a finished write
  // lands first (see usePreferences' onSuccess).
  // Without a successful read the list is unknown and saving would replace the
  // real history with a single entry (or nothing): null then, and no write.
  const latestSearches = (): string[] | null =>
    queryClient.getQueryData<UserPreferences>(queryKeys.local.preferences)?.recentSearches ?? (data ? [] : null);

  const addSearch = (query: string) => {
    const trimmed = query.trim();
    const current = latestSearches();
    if (!trimmed || current === null) return;
    const deduped = [trimmed, ...current.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())];
    setPreference({ key: "recentSearches", value: deduped.slice(0, MAX_RECENT_SEARCHES) });
  };

  const removeSearch = (query: string) => {
    const current = latestSearches();
    if (current === null) return;
    setPreference({ key: "recentSearches", value: current.filter((entry) => entry !== query) });
  };

  const clearHistory = () => {
    setPreference({ key: "recentSearches", value: [] });
  };

  return { recentSearches, addSearch, removeSearch, clearHistory };
}
