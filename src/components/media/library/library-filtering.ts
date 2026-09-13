import type { MediaGridItem } from "@/components/media/primitives/media-grid";
import type { CustomListItem, LibraryItem, LibraryStatus } from "@/types/media";

export type LibraryTypeFilter = "all" | "movie" | "series";
export type LibraryStatusFilter = LibraryStatus | "all";
export type LibrarySortMode = "recent" | "title" | "rating";

export interface LibraryFilterCriteria {
  typeFilter: LibraryTypeFilter;
  statusFilter: LibraryStatusFilter;
  favouritesOnly: boolean;
  search: string;
  sort: LibrarySortMode;
  /** Media keys ("movie-123") the currently selected custom list contains — `null` when no list filter is active. */
  listMediaKeys: Set<string> | null;
  /** Media keys the currently selected smart list matches — `null` when no smart list filter is active. */
  smartListMediaKeys: Set<string> | null;
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
  const { typeFilter, statusFilter, favouritesOnly, search, sort, listMediaKeys, smartListMediaKeys } = criteria;
  const libraryByKey = new Map(libraryItems.map((item) => [libraryMediaKey(item.mediaType, item.mediaId), item]));
  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (title: string) => (normalizedSearch ? title.toLowerCase().includes(normalizedSearch) : true);

  const fromLibrary = libraryItems
    .filter((item) => (typeFilter === "all" ? true : item.mediaType === typeFilter))
    .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
    .filter((item) => (favouritesOnly ? item.favourite : true))
    .filter((item) => (listMediaKeys ? listMediaKeys.has(libraryMediaKey(item.mediaType, item.mediaId)) : true))
    .filter((item) =>
      smartListMediaKeys ? smartListMediaKeys.has(libraryMediaKey(item.mediaType, item.mediaId)) : true
    )
    .filter((item) => matchesSearch(item.title))
    .map((item) => ({
      sortKey: item.updatedAt,
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

  // Only ever restricts library items (a smart list's rules — status,
  // rating, ... — can't be evaluated against a custom-list-only item that
  // was never added to the library), so this stays empty whenever a smart
  // list is active.
  const listOnly =
    listMediaKeys === null || smartListMediaKeys !== null
      ? []
      : listItems
          .filter((li) => !libraryByKey.has(libraryMediaKey(li.mediaType, li.mediaId)))
          .filter((li) => (typeFilter === "all" ? true : li.mediaType === typeFilter))
          .filter(() => statusFilter === "all" && !favouritesOnly)
          .filter((li) => matchesSearch(li.title))
          .map((li) => ({
            sortKey: li.addedAt,
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
      return b.sortKey.localeCompare(a.sortKey);
    })
    .map((entry) => entry.media);
}
