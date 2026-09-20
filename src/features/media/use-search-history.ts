import { usePreferences } from "@/features/preferences/use-preferences";

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
  const { data, updatePreference } = usePreferences();
  const recentSearches = data?.recentSearches ?? [];

  const addSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const deduped = [trimmed, ...recentSearches.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())];
    void updatePreference({ key: "recentSearches", value: deduped.slice(0, MAX_RECENT_SEARCHES) });
  };

  const removeSearch = (query: string) => {
    void updatePreference({ key: "recentSearches", value: recentSearches.filter((entry) => entry !== query) });
  };

  const clearHistory = () => {
    void updatePreference({ key: "recentSearches", value: [] });
  };

  return { recentSearches, addSearch, removeSearch, clearHistory };
}
