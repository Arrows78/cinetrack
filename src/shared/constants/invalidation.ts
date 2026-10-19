import type { QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/shared/constants/query-keys";

/**
 * Which cached reads a write moves out from under, grouped by the domain the
 * write belongs to. Every mutation that touches one of these domains
 * invalidates the domain's list from here instead of retyping its own, so a
 * new reader of a domain (a new rail, a new count) is added in one place and
 * reaches every writer.
 *
 * The domains nest on purpose: each wider one is built from the narrower one
 * it contains, never from a second copy of its keys.
 *
 * - `libraryStatus`: a library status moving on titles that stay in the library.
 * - `library`: a library row appearing, vanishing or changing (⊇ `libraryStatus`).
 * - `progress`: a watch written for a series' episodes (⊇ `library`, since a
 *   watch can auto-start or complete the library entry).
 */
export const invalidationKeys = {
  /**
   * What a status move on titles that stay in the library can change: the
   * lists and counts that read statuses, the statistics that count completed
   * titles, and the two candidate pools built from them. The membership set,
   * the tags, the history, the tracking calendar and the dismissals are
   * untouched by a status move.
   */
  libraryStatus: (profileId: string): QueryKey[] => [
    queryKeys.local.library(profileId),
    queryKeys.local.libraryPage(profileId),
    queryKeys.local.stats(profileId),
    queryKeys.local.completedLibraryCandidates(profileId),
    queryKeys.local.bestRecommendationSeed(profileId),
  ],

  /** Every query a library write can move something out from under. */
  library: (profileId: string): QueryKey[] => [
    ...invalidationKeys.libraryStatus(profileId),
    queryKeys.local.history(profileId),
    queryKeys.local.watchTonight(profileId),
    queryKeys.local.tracking(profileId),
    queryKeys.local.libraryMediaKeys(profileId),
    // A save can add or drop a tag and a removal drops the item's tags —
    // the tag editor's autocomplete reads this list.
    queryKeys.local.libraryDistinctTags(profileId),
    // Planning a title lifts its "not interested" dismissal in Rust.
    queryKeys.local.dismissedRecommendations(profileId),
  ],

  /**
   * A write to one series' episode progress (a toggle, a bulk mark, a rating):
   * the series' own progress, its watch-next entry, its viewing-event diary and
   * the tracked-series list, plus everything the library domain feeds —
   * watching an episode can auto-start or complete an existing library entry
   * (see docs/library-status.md).
   */
  progress: (profileId: string, seriesId: number): QueryKey[] => [
    queryKeys.local.episodeProgress(profileId, seriesId),
    queryKeys.local.watchNextEpisode(profileId, seriesId),
    queryKeys.local.viewingEventsForMedia(profileId, "series", seriesId),
    queryKeys.local.trackedSeries(profileId),
    ...invalidationKeys.library(profileId),
  ],

  /** A write to one movie's seen state or watch log (a toggle, a rewatch). */
  movieWatch: (profileId: string, movieId: number): QueryKey[] => [
    queryKeys.local.movieSeen(profileId, movieId),
    queryKeys.local.viewingEventsForMedia(profileId, "movie", movieId),
    ...invalidationKeys.library(profileId),
  ],

  /** A refresh of the tracked series' cached status/total, which can reopen a completed entry. */
  trackedSeries: (profileId: string): QueryKey[] => [
    queryKeys.local.trackedSeries(profileId),
    ...invalidationKeys.library(profileId),
  ],
} as const;
