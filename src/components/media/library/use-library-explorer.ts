import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActiveFilterChip } from "@/components/media/library/active-filter-chips";
import type { MediaGridItem } from "@/components/media/primitives/media-grid";
import {
  filterAndSortLibrary,
  libraryMediaKey,
  type LibrarySortMode,
  type LibraryStatusFilter,
  type LibraryTypeFilter,
} from "@/components/media/library/library-filtering";
import { useAllCustomListItems, useCustomListItems, useCustomLists } from "@/features/custom-lists/use-custom-lists";
import { useLibrary, useLibraryMediaKeys, useLibraryPage } from "@/features/library/use-library";
import { useSmartLists } from "@/features/smart-lists/use-smart-lists";
import { useSmartListMatches } from "@/components/media/library/use-smart-list-matches";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { DEBOUNCE_MS } from "@/shared/constants/query";
import type { LibraryFilterState } from "@/types/media";

const statusOptions: LibraryStatusFilter[] = ["all", "planned", "watching", "paused", "completed", "dropped"];

/**
 * Owns every piece of LibraryExplorer's filter/sort interaction state, the
 * query wiring behind it, and the resulting derived data (the filtered
 * item list, chips, saved-filter snapshot) — LibraryExplorer itself only
 * renders what this returns. The client-side filter/sort pass lives in
 * library-filtering.ts as a plain function so it's unit-testable on its own,
 * without rendering anything.
 */
export function useLibraryExplorer(lockedMediaType?: "movie" | "series") {
  const { t } = useTranslation();
  const libraryMediaKeysQuery = useLibraryMediaKeys();
  const { data: trackedSeries } = useTrackedSeries();
  const lists = useCustomLists();
  const preferences = usePreferences();
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>(lockedMediaType ?? "all");
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>("all");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LibrarySortMode>("recent");
  // Persisted (not local state) — a user's grid/list choice should survive
  // navigating away and back, and hold across /library, /movies and /series
  // since they all render this same explorer.
  const viewMode = preferences.data?.libraryViewMode ?? "grid";
  const setViewMode = (mode: "grid" | "list") =>
    void preferences.updatePreference({ key: "libraryViewMode", value: mode });
  const [listFilter, setListFilter] = useState("all");
  const listItems = useCustomListItems(listFilter === "all" ? "" : listFilter);
  // A title added to a list but never given a library status (no
  // library_items row at all) otherwise only ever surfaced while that one
  // list was selected — invisible from the default "browse everything" view,
  // including the /movies and /series "Haven't started" sections. Merging
  // every list's items in (deduplicated by media key in filterAndSortLibrary)
  // fixes that without touching the single-list fetch above, which still
  // drives the selected-list loading/error UI in library-explorer.tsx.
  const listIds = useMemo(() => (lists.data ?? []).map((list) => list.id), [lists.data]);
  const allListItems = useAllCustomListItems(listIds);
  const smartLists = useSmartLists();
  const [smartListFilter, setSmartListFilter] = useState("all");
  const activeSmartList =
    smartListFilter === "all" ? undefined : smartLists.data?.find((list) => list.id === smartListFilter);
  // Evaluated live against the current library/tracked-series/preferences
  // data every render — never a stored/cached set of matching ids (see
  // smart-list-evaluation.ts) — then folded into `filtered` below the same
  // way a selected custom list already restricts by media key.
  const smartListMatches = useSmartListMatches(activeSmartList?.rules);

  // Server-side cursor pagination only applies to the plain "browse
  // everything" view: a custom-list or smart-list filter restricts to an
  // already-bounded candidate set (the list's own items, or the smart list's
  // matches) that's cheaper to keep filtering client-side than to thread
  // through the server query, and lockedMediaType's "My list" tabs bucket by
  // watch progress up front (see MovieLibrarySections/SeriesLibrarySections),
  // which needs the whole set for that media type at once. The hook scopes
  // that locked-hub read in SQLite; custom/smart-list modes keep the full
  // fallback because they may intersect both media types.
  const isServerPaginated = !lockedMediaType && listFilter === "all" && smartListFilter === "all";
  // Not needed at all in server-paginated mode (the plain default browse
  // view) — gated so that common case doesn't pay for a full library read
  // it never renders.
  const libraryQuery = useLibrary({ enabled: !isServerPaginated, mediaType: lockedMediaType });
  const { data: items } = libraryQuery;
  const debouncedSearch = useDebouncedValue(search, DEBOUNCE_MS);
  const libraryPageQuery = useLibraryPage(
    {
      mediaType: typeFilter === "all" ? undefined : typeFilter,
      status: statusFilter,
      favouritesOnly,
      search: debouncedSearch,
      sort,
    },
    { enabled: isServerPaginated }
  );

  const progressBySeries = useMemo(
    () =>
      new Map(
        (trackedSeries ?? []).map((series) => [
          series.seriesId,
          { watched: series.watchedEpisodes, total: series.totalEpisodes, seriesStatus: series.status },
        ])
      ),
    [trackedSeries]
  );

  const serverItems = useMemo<MediaGridItem[]>(() => {
    if (!isServerPaginated) return [];
    return (libraryPageQuery.data?.pages ?? [])
      .flatMap((page) => page.items)
      .map((item) => ({
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
      }));
  }, [isServerPaginated, libraryPageQuery.data, progressBySeries]);

  const loadNextServerPage = () => {
    if (libraryPageQuery.hasNextPage && !libraryPageQuery.isFetchingNextPage) void libraryPageQuery.fetchNextPage();
  };

  const filtered = useMemo(() => {
    const listMediaKeys =
      listFilter === "all"
        ? null
        : new Set((listItems.data ?? []).map((li) => libraryMediaKey(li.mediaType, li.mediaId)));
    const smartListMediaKeys =
      smartListFilter === "all"
        ? null
        : new Set(smartListMatches.items.map((media) => libraryMediaKey(media.mediaType, media.id)));

    // Browsing "all" surfaces list-only items across every list; a specific
    // list already has its own scoped, already-fetched data.
    const listOnlySource = listFilter === "all" ? (allListItems.data ?? []) : (listItems.data ?? []);

    return filterAndSortLibrary(items ?? [], listOnlySource, progressBySeries, {
      typeFilter,
      statusFilter,
      favouritesOnly,
      search,
      sort,
      listMediaKeys,
      smartListMediaKeys,
    });
  }, [
    items,
    progressBySeries,
    typeFilter,
    statusFilter,
    favouritesOnly,
    search,
    sort,
    listFilter,
    listItems.data,
    allListItems.data,
    smartListFilter,
    smartListMatches.items,
  ]);

  const isFilteredToList = listFilter !== "all";
  const resetListFilter = () => setListFilter("all");
  // A membership-only check (not the full useLibrary() read, which is
  // disabled in server-paginated mode) — needed in every mode to
  // distinguish "the library is genuinely empty" from "no results match
  // these filters."
  const hasAnyLibraryItems = (libraryMediaKeysQuery.data?.length ?? 0) > 0;
  const clearFilters = () => {
    setTypeFilter(lockedMediaType ?? "all");
    setStatusFilter("all");
    setFavouritesOnly(false);
    setListFilter("all");
    setSmartListFilter("all");
    setSearch("");
  };

  // Exactly the state a saved filter captures/restores (see
  // src/types/media.ts's LibraryFilterState doc comment) — reused as-is
  // rather than a parallel shape, so saving "the current filters" and
  // reopening a saved one are both plain assignments, no translation layer.
  const currentFilters: LibraryFilterState = { typeFilter, statusFilter, favouritesOnly, listFilter, sort, search };
  const applySavedFilters = (saved: LibraryFilterState) => {
    setTypeFilter(lockedMediaType ?? saved.typeFilter);
    setStatusFilter(saved.statusFilter);
    setFavouritesOnly(saved.favouritesOnly);
    setListFilter(saved.listFilter);
    setSort(saved.sort);
    setSearch(saved.search);
  };

  // One removable chip per non-default filter condition currently applied —
  // `lockedMediaType` pins typeFilter to a value the user never chose (the
  // /movies and /series "My list" tabs), so that one dimension never shows
  // as a removable chip there.
  const chips: ActiveFilterChip[] = [
    ...(!lockedMediaType && typeFilter !== "all"
      ? [
          {
            key: "type",
            label: t("filters.chips.type", { value: typeFilter === "movie" ? t("nav.movies") : t("nav.series") }),
            onRemove: () => setTypeFilter("all"),
          },
        ]
      : []),
    ...(statusFilter !== "all"
      ? [
          {
            key: "status",
            label: t("filters.chips.status", { value: t(`library.statuses.${statusFilter}`) }),
            onRemove: () => setStatusFilter("all"),
          },
        ]
      : []),
    ...(favouritesOnly
      ? [{ key: "favourites", label: t("filters.chips.favourites"), onRemove: () => setFavouritesOnly(false) }]
      : []),
    ...(listFilter !== "all"
      ? [
          {
            key: "list",
            label: t("filters.chips.list", {
              value: lists.data?.find((list) => list.id === listFilter)?.name ?? listFilter,
            }),
            onRemove: resetListFilter,
          },
        ]
      : []),
    ...(sort !== "recent"
      ? [
          {
            key: "sort",
            label: t("filters.chips.sort", {
              value: sort === "title" ? t("library.title") : t("library.rating"),
            }),
            onRemove: () => setSort("recent"),
          },
        ]
      : []),
    ...(search.trim()
      ? [{ key: "search", label: t("filters.chips.search", { value: search }), onRemove: () => setSearch("") }]
      : []),
  ];

  return {
    statusOptions,
    lists,
    smartLists,
    trackedSeries,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    favouritesOnly,
    setFavouritesOnly,
    search,
    setSearch,
    sort,
    setSort,
    viewMode,
    setViewMode,
    listFilter,
    setListFilter,
    smartListFilter,
    setSmartListFilter,
    isServerPaginated,
    libraryQuery,
    libraryPageQuery,
    serverItems,
    loadNextServerPage,
    listItems,
    smartListMatches,
    filtered,
    isFilteredToList,
    resetListFilter,
    hasAnyLibraryItems,
    clearFilters,
    currentFilters,
    applySavedFilters,
    chips,
  };
}
