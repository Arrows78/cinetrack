import { mediaKey } from "@/shared/utils/media-key";
import type { MediaGridItem } from "@/components/media/primitives/media-grid";
import type { CustomListItem, LibraryFilterState, LibraryItem, LibraryStatus } from "@/types/media";

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
  /** Media keys ("movie:123") the currently selected custom list contains — `null` when no list filter is active. */
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

/**
 * A series' soonest upcoming episode date, "" when it has none. The map is
 * keyed by TMDB *series* id, so a movie that happens to share the number must
 * not read a series' date.
 */
function nextEpisodeDateOf(
  dates: Map<number, string> | undefined,
  item: { mediaType: string; mediaId: number }
): string {
  return item.mediaType === "series" ? (dates?.get(item.mediaId) ?? "") : "";
}

/** The `library.*` label of a sort mode — what its option and its active-filter chip both say. */
export function librarySortLabelKey(sort: LibrarySortMode) {
  return `library.${sort}` as const;
}

/**
 * A saved filter outlives the custom or smart list it points at: reapplying
 * one whose list was deleted since would filter by an id the backend answers
 * "not found" to (an error screen, not a result). Such a list is dropped back
 * to "all lists". A known-id list that is still loading is `undefined`, in
 * which case nothing is dropped — it can't be told yet. A smart list is only
 * kept when `knownSmartListIds` is given at all (the hubs have no smart-list
 * panel, so a smart-list filter applied there would narrow the view
 * invisibly).
 */
export function resolveSavedLibraryFilters(
  saved: LibraryFilterState,
  knownListIds: readonly string[] | undefined,
  knownSmartListIds?: readonly string[]
): LibraryFilterState {
  const { smartListFilter, ...rest } = saved;
  const resolved: LibraryFilterState =
    rest.listFilter === "all" || knownListIds === undefined || knownListIds.includes(rest.listFilter)
      ? rest
      : { ...rest, listFilter: "all" };
  return smartListFilter && smartListFilter !== "all" && knownSmartListIds?.includes(smartListFilter)
    ? { ...resolved, smartListFilter }
    : resolved;
}

type LibraryEntry = { sortKey: string; media: MediaGridItem };

// Ties break on (id, media type) the way the server's keyset order does
// (library/queries.rs), so the same library reads in the same order whether
// this pass or SQLite sorted it — and never in whatever order the rows
// happened to arrive.
// Two items never share an id *and* a media type (the key is unique), so the
// media type only has to separate a movie from a series with the same id.
const byIdentity = (a: MediaGridItem, b: MediaGridItem, direction: 1 | -1) =>
  direction * (a.id - b.id) || direction * (a.mediaType < b.mediaType ? -1 : 1);
// ISO timestamps compare as plain strings; localeCompare would apply
// locale collation rules to what is not text.
const compareIso = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sortEntries(entries: LibraryEntry[], sort: LibrarySortMode): MediaGridItem[] {
  return entries

    .sort((a, b) => {
      if (sort === "title") return a.media.title.localeCompare(b.media.title) || byIdentity(a.media, b.media, 1);
      if (sort === "rating") {
        return (b.media.rating ?? 0) - (a.media.rating ?? 0) || byIdentity(a.media, b.media, -1);
      }
      if (sort === "nextEpisode") {
        // Ascending (soonest first), unlike every other sort's newest/
        // highest-first order — and an empty sortKey (nothing airing in the
        // tracked window) always sorts last, never first.
        if (!a.sortKey && !b.sortKey) return byIdentity(a.media, b.media, -1);
        if (!a.sortKey) return 1;
        if (!b.sortKey) return -1;
        return compareIso(a.sortKey, b.sortKey) || byIdentity(a.media, b.media, -1);
      }
      return compareIso(b.sortKey, a.sortKey) || byIdentity(a.media, b.media, -1);
    })
    .map((entry) => entry.media);
}

/**
 * The custom-list entries that have no library row at all (see
 * custom_list_items, which has no dependency on library_items), as sortable
 * grid entries. `listItems` is whatever the caller decided is in scope — every
 * list's items when browsing "all", or just the selected list's own. They
 * carry no status, rating, genres or progress, so any filter on those hides
 * them; a smart list's rules can't be evaluated against them either, so an
 * active smart list hides them too.
 */
function listOnlyEntries(
  libraryKeys: Set<string>,
  listItems: CustomListItem[],
  criteria: LibraryFilterCriteria,
  matchesSearch: (text: string) => boolean
): Array<{ sortKey: string; media: MediaGridItem }> {
  const { typeFilter, statusFilter, favouritesOnly, sort, genreFilter, smartListMediaKeys, nextEpisodeDateBySeriesId } =
    criteria;
  const seenListOnlyKeys = new Set<string>();
  if (smartListMediaKeys !== null) return [];
  return listItems
    .filter((li) => !libraryKeys.has(mediaKey(li.mediaType, li.mediaId)))
    .filter((li) => (typeFilter === "all" ? true : li.mediaType === typeFilter))
    .filter(() => statusFilter === "all" && !favouritesOnly && genreFilter === "all")
    .filter((li) => matchesSearch(li.title))
    .filter((li) => {
      // The same title can live in more than one list — one card, not
      // one per list it happens to be on.
      const key = mediaKey(li.mediaType, li.mediaId);
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
            ? nextEpisodeDateOf(nextEpisodeDateBySeriesId, li)
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
const searchMatcher = (search: string) => {
  const normalizedSearch = search.trim().toLowerCase();
  return (text: string) => (normalizedSearch ? text.toLowerCase().includes(normalizedSearch) : true);
};

/**
 * The titles that sit in a custom list without ever having a library row,
 * filtered and ordered like the rest of the explorer — for the server-paginated
 * browse view, whose query only knows library rows (see use-library-explorer.ts).
 * `libraryKeys` is every library media key, so a listed title that does have a
 * row is left to the server pages.
 */
export function listOnlyLibraryItems(
  libraryKeys: Set<string>,
  listItems: CustomListItem[],
  criteria: LibraryFilterCriteria
): MediaGridItem[] {
  return sortEntries(listOnlyEntries(libraryKeys, listItems, criteria, searchMatcher(criteria.search)), criteria.sort);
}

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
  const libraryByKey = new Map(libraryItems.map((item) => [mediaKey(item.mediaType, item.mediaId), item]));
  const matchesSearch = searchMatcher(search);
  // Library items can also be found by their private notes or tags, not just
  // the title — a "liste seule" item (CustomListItem) has neither, so it
  // only ever matches on title (see matchesSearch(li.title) below).
  const matchesLibrarySearch = (item: LibraryItem) =>
    matchesSearch([item.title, item.notes ?? "", ...item.tags].join(" "));

  const fromLibrary = libraryItems
    .filter((item) => (typeFilter === "all" ? true : item.mediaType === typeFilter))
    .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
    .filter((item) => (favouritesOnly ? item.favourite : true))
    .filter((item) => (genreFilter === "all" ? true : item.genres.includes(genreFilter)))
    .filter((item) => (listMediaKeys ? listMediaKeys.has(mediaKey(item.mediaType, item.mediaId)) : true))
    .filter((item) => (smartListMediaKeys ? smartListMediaKeys.has(mediaKey(item.mediaType, item.mediaId)) : true))
    .filter((item) => matchesLibrarySearch(item))
    .map((item) => ({
      sortKey:
        sort === "dateAdded"
          ? item.createdAt
          : sort === "dateCompleted"
            ? (item.completedAt ?? "")
            : sort === "nextEpisode"
              ? nextEpisodeDateOf(nextEpisodeDateBySeriesId, item)
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

  const listOnly = listOnlyEntries(new Set(libraryByKey.keys()), listItems, criteria, matchesSearch);

  return sortEntries([...fromLibrary, ...listOnly], sort);
}
