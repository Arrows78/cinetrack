import type { MediaGridItem } from "@/components/media/primitives/media-grid";
import type { CustomListItem, LibraryItem, LibraryStatus } from "@/types/media";

export type LibraryTypeFilter = "all" | "movie" | "series";
export type LibraryStatusFilter = LibraryStatus | "all";
export type LibrarySortMode = "recent" | "title" | "rating" | "dateAdded" | "dateCompleted" | "nextEpisode";

export interface LibraryFilterCriteria {
  typeFilter: LibraryTypeFilter;
  statusFilter: LibraryStatusFilter;
  favouritesOnly: boolean;
  search: string;
  sort: LibrarySortMode;
  /** Canonical genre label (see shared/constants/discover.ts's GENRES), or "all" for no filter. */
  genreFilter: string;
  /** Media keys ("movie-123") the currently selected custom list contains — `null` when no list filter is active. */
  listMediaKeys: Set<string> | null;
  /** Media keys the currently selected smart list matches — `null` when no smart list filter is active. */
  smartListMediaKeys: Set<string> | null;
  /**
   * Series id -> its soonest upcoming episode's air date, from the same
   * 60-day tracking calendar the /tracking page reads (see useTracking) —
   * only ever populated for the series hub's own "nextEpisode" sort mode.
   * A series with nothing airing in that window (on hiatus, between
   * seasons, further out than 60 days) has no entry and sorts last, same
   * as one with no completedAt under "dateCompleted".
   */
  nextEpisodeDateBySeriesId?: Map<number, string>;
}

export function libraryMediaKey(mediaType: string, mediaId: number): string {
  return `${mediaType}-${mediaId}`;
}

/**
 * The client-side filter/sort pass LibraryExplorer applies once its data is
 * in hand — extracted as a pure function (no hooks, no React) so it's
 * directly unit-testable, separately from the query wiring in
 * use-library-explorer.ts. Combines two sources: `libraryItems` (has
 * status/rating/progress) and, when a custom list is selected,
 * `listItems` — that list's own rows, including ones never added to the
 * library at all (custom_list_items has no dependency on library_items; see
 * src-tauri/src/lists/custom/), which render with no status/rating/progress.
 */
export function filterAndSortLibrary(
  libraryItems: LibraryItem[],
  listItems: CustomListItem[],
  progressBySeries: Map<number, { watched: number; total: number; seriesStatus: string | null }>,
  criteria: LibraryFilterCriteria
): MediaGridItem[] {
  const {
    typeFilter,
    statusFilter,
    favouritesOnly,
    search,
    sort,
    genreFilter,
    listMediaKeys,
    smartListMediaKeys,
    nextEpisodeDateBySeriesId,
  } = criteria;
  const libraryByKey = new Map(libraryItems.map((item) => [libraryMediaKey(item.mediaType, item.mediaId), item]));
  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (text: string) => (normalizedSearch ? text.toLowerCase().includes(normalizedSearch) : true);
  // Library items can also be found by their private notes or tags, not just
  // the title — a "liste seule" item (CustomListItem) has neither, so it
  // only ever matches on title (see matchesSearch(li.title) below).
  const matchesLibrarySearch = (item: LibraryItem) =>
    matchesSearch([item.title, item.notes ?? "", ...(item.tags ?? [])].join(" "));

  const fromLibrary = libraryItems
    .filter((item) => (typeFilter === "all" ? true : item.mediaType === typeFilter))
    .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
    .filter((item) => (favouritesOnly ? item.favourite : true))
    .filter((item) => (genreFilter === "all" ? true : item.genres.includes(genreFilter)))
    .filter((item) => (listMediaKeys ? listMediaKeys.has(libraryMediaKey(item.mediaType, item.mediaId)) : true))
    .filter((item) =>
      smartListMediaKeys ? smartListMediaKeys.has(libraryMediaKey(item.mediaType, item.mediaId)) : true
    )
    .filter((item) => matchesLibrarySearch(item))
    .map((item) => ({
      sortKey:
        sort === "dateAdded"
          ? item.createdAt
          : sort === "dateCompleted"
            ? (item.completedAt ?? "")
            : sort === "nextEpisode"
              ? (nextEpisodeDateBySeriesId?.get(item.mediaId) ?? "")
              : item.updatedAt,
      media: {
        id: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        overview: "",
        year: item.year,
        rating: item.userRating ?? item.rating,
        genres: item.genres,
        cast: [],
        progress: item.mediaType === "series" ? progressBySeries.get(item.mediaId) : undefined,
        alreadySeen: item.mediaType === "movie" && item.status === "completed",
      } as MediaGridItem,
    }));

  // `listItems` is whatever the caller decided is in scope — every list's
  // items when browsing "all" (so a title added to a list but never given a
  // library status still shows up there), or just the selected list's own
  // items once one is chosen. Never restricted by a smart list's rules —
  // those can't be evaluated against a custom-list-only item that was never
  // added to the library — so this stays empty whenever a smart list is
  // active.
  const seenListOnlyKeys = new Set<string>();
  const listOnly =
    smartListMediaKeys !== null
      ? []
      : listItems
          .filter((li) => !libraryByKey.has(libraryMediaKey(li.mediaType, li.mediaId)))
          .filter((li) => (typeFilter === "all" ? true : li.mediaType === typeFilter))
          .filter(() => statusFilter === "all" && !favouritesOnly && genreFilter === "all")
          .filter((li) => matchesSearch(li.title))
          .filter((li) => {
            // The same title can live in more than one list — one card, not
            // one per list it happens to be on.
            const key = libraryMediaKey(li.mediaType, li.mediaId);
            if (seenListOnlyKeys.has(key)) return false;
            seenListOnlyKeys.add(key);
            return true;
          })
          .map((li) => ({
            // Never completed (not a library item at all) — sorts last under
            // "dateCompleted", same as a library item with no completedAt.
            sortKey:
              sort === "dateCompleted"
                ? ""
                : sort === "nextEpisode"
                  ? (nextEpisodeDateBySeriesId?.get(li.mediaId) ?? "")
                  : li.addedAt,
            media: {
              id: li.mediaId,
              mediaType: li.mediaType,
              title: li.title,
              posterPath: li.posterPath,
              overview: "",
              genres: [],
              cast: [],
            } as MediaGridItem,
          }));

  return [...fromLibrary, ...listOnly]
    .sort((a, b) => {
      if (sort === "title") return a.media.title.localeCompare(b.media.title);
      if (sort === "rating") return (b.media.rating ?? 0) - (a.media.rating ?? 0);
      if (sort === "nextEpisode") {
        // Ascending (soonest first), unlike every other sort's newest/
        // highest-first order — and an empty sortKey (nothing airing in the
        // tracked window) always sorts last, never first.
        if (!a.sortKey && !b.sortKey) return 0;
        if (!a.sortKey) return 1;
        if (!b.sortKey) return -1;
        return a.sortKey.localeCompare(b.sortKey);
      }
      return b.sortKey.localeCompare(a.sortKey);
    })
    .map((entry) => entry.media);
}
