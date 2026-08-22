import type { AvailabilitySnapshot, LibraryItem, SmartListRules, TrackedSeriesItem } from "@/types/media";

// Mirrors watch-tonight-page.tsx's MY_SERVICES_VALUE idea: "mine" resolves
// to the profile's own preferredProviderIds preference at evaluation time
// rather than being stored as a fixed provider id.
export const SMART_LIST_PROVIDER_ANY = "any";
export const SMART_LIST_PROVIDER_MINE = "mine";

// Sentinel value for "no smart list selected as the active grid filter" —
// shared between library-explorer.tsx (the Select control) and
// smart-lists-panel.tsx (clearing the selection when the active list gets
// deleted), so the two never drift on what "cleared" means.
export const NO_SMART_LIST_SELECTED = "all";

export const DEFAULT_SMART_LIST_RULES: SmartListRules = {
  status: "any",
  mediaType: "any",
  genre: null,
  maxRuntimeMinutes: null,
  minRating: null,
  provider: SMART_LIST_PROVIDER_ANY,
  hasEpisodeWaiting: false,
};

/** Everything matchesSmartListRules needs beyond the rule set and the item itself — one bundle per evaluation pass, built once by the caller rather than looked up per item. */
export interface SmartListEvalContext {
  trackedSeriesBySeriesId: Map<number, TrackedSeriesItem>;
  preferredProviderIds: number[];
  /** Keyed by `${mediaType}-${mediaId}`, mirroring the key LibraryExplorer already uses to join library items against tracked series/list membership. */
  snapshotsByMediaKey: Map<string, AvailabilitySnapshot>;
}

export function buildSmartListEvalContext(
  trackedSeries: TrackedSeriesItem[],
  preferredProviderIds: number[],
  snapshots: AvailabilitySnapshot[]
): SmartListEvalContext {
  return {
    trackedSeriesBySeriesId: new Map(trackedSeries.map((series) => [series.seriesId, series])),
    preferredProviderIds,
    snapshotsByMediaKey: new Map(snapshots.map((snapshot) => [`${snapshot.mediaType}-${snapshot.mediaId}`, snapshot])),
  };
}

/**
 * Pure predicate a smart list evaluates a library item against — every rule
 * dimension is AND-combined (see SmartListRules's own doc comment for why
 * that's enough for every README example).
 *
 * `movieRuntimeMinutes` is passed in rather than looked up here: runtime is
 * catalogue metadata (TMDB `Movie.runtime`), not personal data stored on the
 * library row (see CLAUDE.md's data-model split), so the caller resolves it
 * — from cache or a live fetch — only for the items that already passed
 * every cheaper, purely-local check. `undefined` means "not yet known" (the
 * item is provisionally excluded rather than false-positived while the
 * runtime is still loading); `null` means "known to have none".
 */
export function matchesSmartListRules(
  item: LibraryItem,
  rules: SmartListRules,
  context: SmartListEvalContext,
  movieRuntimeMinutes: number | null | undefined
): boolean {
  if (rules.status !== "any" && item.status !== rules.status) return false;
  if (rules.mediaType !== "any" && item.mediaType !== rules.mediaType) return false;
  if (rules.genre && !item.genres.includes(rules.genre)) return false;

  if (rules.minRating != null) {
    const rating = item.userRating ?? item.rating ?? null;
    if (rating == null || rating < rules.minRating) return false;
  }

  if (rules.provider !== SMART_LIST_PROVIDER_ANY) {
    const targetProviderIds =
      rules.provider === SMART_LIST_PROVIDER_MINE ? context.preferredProviderIds : [rules.provider];
    if (targetProviderIds.length === 0) return false;

    const snapshot = context.snapshotsByMediaKey.get(`${item.mediaType}-${item.mediaId}`);
    if (!snapshot) return false;
    if (!snapshot.providerIds.some((providerId) => targetProviderIds.includes(providerId))) return false;
  }

  if (rules.hasEpisodeWaiting) {
    if (item.mediaType !== "series") return false;
    const tracked = context.trackedSeriesBySeriesId.get(item.mediaId);
    if (!tracked || tracked.watchedEpisodes >= tracked.totalEpisodes) return false;
  }

  // See this function's doc comment: this rule never excludes series, only
  // movies whose runtime is known and over the limit.
  if (rules.maxRuntimeMinutes != null && item.mediaType === "movie") {
    if (movieRuntimeMinutes == null) return false;
    if (movieRuntimeMinutes > rules.maxRuntimeMinutes) return false;
  }

  return true;
}
