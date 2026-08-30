import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { FolderHeart, Heart, LayoutGrid, LibraryBig, List, ListPlus, SearchX, Sparkles, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/media/library/active-filter-chips";
import { FilterBar } from "@/components/media/library/filter-bar";
import { MediaGrid, type MediaGridItem } from "@/components/media/primitives/media-grid";
import { MediaList } from "@/components/media/primitives/media-list";
import { MovieLibrarySections, SeriesLibrarySections } from "@/components/media/library/library-sections";
import { SavedFiltersBar } from "@/components/media/library/saved-filters-bar";
import { SearchBar } from "@/components/media/primitives/search-bar";
import { SmartListsAccordionContent } from "@/components/media/library/smart-lists-panel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useCustomListItems, useCustomLists } from "@/features/custom-lists/use-custom-lists";
import { useLibrary, useLibraryMediaKeys, useLibraryPage } from "@/features/library/use-library";
import { useSmartLists } from "@/features/smart-lists/use-smart-lists";
import { useSmartListMatches } from "@/components/media/library/use-smart-list-matches";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { DEBOUNCE_MS } from "@/shared/constants/query";
import type { LibraryFilterState, LibraryStatus } from "@/types/media";

type StatusFilter = LibraryStatus | "all";

const statusOptions: StatusFilter[] = ["all", "planned", "watching", "paused", "completed", "dropped"];

function ListItemRow({ listId }: { listId: string }) {
  const { t } = useTranslation();
  const items = useCustomListItems(listId);
  const [pendingRemoval, setPendingRemoval] = useState<{
    mediaId: number;
    mediaType: "movie" | "series";
    title: string;
  } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (items.isLoading) return <LoadingState />;
  if (items.isError) {
    return <RemoteErrorState error={items.error} onRetry={() => void items.refetch()} />;
  }
  if (!items.data?.length) return <p className="text-sm text-muted-foreground">{t("library.lists.itemsEmpty")}</p>;
  return (
    <div className="grid gap-2">
      {items.data.map((item) => (
        <Tile key={`${item.mediaType}-${item.mediaId}`} className="flex items-center justify-between px-3 py-2 text-sm">
          <span>
            {item.title} <span className="text-muted-foreground">· {t(`media.${item.mediaType}`)}</span>
          </span>
          <IconTooltip label={t("library.lists.removeItem", { title: item.title })}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("library.lists.removeItem", { title: item.title })}
              onClick={() => setPendingRemoval({ mediaId: item.mediaId, mediaType: item.mediaType, title: item.title })}
            >
              <Trash2 className="size-4" />
            </Button>
          </IconTooltip>
        </Tile>
      ))}
      {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={t("library.lists.removeItemConfirmTitle", { title: pendingRemoval?.title })}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingRemoval) return;
          setRemoveError(null);
          void items
            .remove({ mediaId: pendingRemoval.mediaId, mediaType: pendingRemoval.mediaType })
            .catch(() => setRemoveError(t("desktop.operationFailed")));
          setPendingRemoval(null);
        }}
      />
    </div>
  );
}

function ListsAccordionContent({
  lists,
  listFilter,
  onListDeleted,
}: {
  lists: ReturnType<typeof useCustomLists>;
  listFilter: string;
  onListDeleted: (deletedId: string) => void;
}) {
  const { t } = useTranslation();
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [openedList, setOpenedList] = useState<string | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<{ id: string; name: string } | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          size="sm"
          value={listName}
          onChange={(event) => setListName(event.target.value)}
          placeholder={t("library.lists.namePlaceholder")}
          aria-label={t("library.lists.nameLabel")}
          maxLength={100}
        />
        <Input
          size="sm"
          value={listDescription}
          onChange={(event) => setListDescription(event.target.value)}
          placeholder={t("library.lists.descriptionPlaceholder")}
          aria-label={t("library.lists.descriptionLabel")}
        />
        <Button
          type="button"
          disabled={!listName.trim()}
          onClick={() => {
            setListActionError(null);
            void lists
              .create({ name: listName, description: listDescription })
              .then(() => {
                setListName("");
                setListDescription("");
              })
              .catch(() => setListActionError(t("desktop.operationFailed")));
          }}
        >
          <ListPlus className="mr-2 size-4" />
          {t("library.lists.create")}
        </Button>
      </div>
      {listActionError ? <p className="mt-3 text-sm text-destructive">{listActionError}</p> : null}
      {lists.isLoading ? (
        <LoadingState className="mt-4" />
      ) : lists.isError ? (
        <div className="mt-4">
          <RemoteErrorState error={lists.error} onRetry={() => void lists.refetch()} />
        </div>
      ) : !lists.data?.length ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("library.lists.noLists")}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {lists.data.map((list) => (
            <Tile key={list.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left text-sm font-medium"
                  aria-expanded={openedList === list.id}
                  aria-controls={`custom-list-items-${list.id}`}
                  onClick={() => setOpenedList((current) => (current === list.id ? null : list.id))}
                >
                  {list.name}
                  {list.description ? (
                    <span className="ml-2 truncate text-muted-foreground">{list.description}</span>
                  ) : null}
                </button>
                <IconTooltip label={t("library.lists.deleteList", { name: list.name })}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("library.lists.deleteList", { name: list.name })}
                    onClick={() => setPendingDeleteList({ id: list.id, name: list.name })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </IconTooltip>
              </div>
              {openedList === list.id ? (
                <div id={`custom-list-items-${list.id}`} className="mt-3">
                  <ListItemRow listId={list.id} />
                </div>
              ) : null}
            </Tile>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={pendingDeleteList !== null}
        onOpenChange={(open) => !open && setPendingDeleteList(null)}
        title={t("library.lists.deleteListConfirmTitle", { name: pendingDeleteList?.name })}
        description={t("library.lists.deleteListConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingDeleteList) return;
          setListActionError(null);
          const deletedId = pendingDeleteList.id;
          void lists
            .remove(deletedId)
            .then(() => {
              if (listFilter === deletedId) onListDeleted(deletedId);
            })
            .catch(() => setListActionError(t("desktop.operationFailed")));
          setPendingDeleteList(null);
        }}
      />
    </>
  );
}

// Reusable across /library (every type, type filter shown) and the /movies
// and /series "My list" tab (lockedMediaType hides that filter and
// pre-constrains it instead) — same filters, sort, custom lists and
// grid/list rendering either way. onBrowseAll/browseAllLabel are only set
// by the /movies and /series tab hosts, which can jump their own tab state
// to Discover — the standalone /library page has no such tab to jump to.
export function LibraryExplorer({
  lockedMediaType,
  onBrowseAll,
  browseAllLabel,
}: {
  lockedMediaType?: "movie" | "series";
  onBrowseAll?: () => void;
  browseAllLabel?: string;
}) {
  const { t } = useTranslation();
  const libraryMediaKeysQuery = useLibraryMediaKeys();
  const { data: trackedSeries } = useTrackedSeries();
  const lists = useCustomLists();
  const preferences = usePreferences();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">(lockedMediaType ?? "all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "rating">("recent");
  // Persisted (not local state) — a user's grid/list choice should survive
  // navigating away and back, and hold across /library, /movies and /series
  // since they all render this same explorer.
  const viewMode = preferences.data?.libraryViewMode ?? "grid";
  const setViewMode = (mode: "grid" | "list") =>
    void preferences.updatePreference({ key: "libraryViewMode", value: mode });
  const [listFilter, setListFilter] = useState("all");
  const listItems = useCustomListItems(listFilter === "all" ? "" : listFilter);
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
    const libraryByKey = new Map((items ?? []).map((item) => [`${item.mediaType}-${item.mediaId}`, item]));
    const listMediaKeys =
      listFilter === "all" ? null : new Set((listItems.data ?? []).map((li) => `${li.mediaType}-${li.mediaId}`));
    // Only ever restricts library items (a smart list's rules — status,
    // rating, ... — can't be evaluated against a custom-list-only item that
    // was never added to the library), so `listOnly` below is skipped
    // entirely whenever a smart list is active.
    const smartListMediaKeys =
      smartListFilter === "all"
        ? null
        : new Set(smartListMatches.items.map((media) => `${media.mediaType}-${media.id}`));
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = (title: string) => (normalizedSearch ? title.toLowerCase().includes(normalizedSearch) : true);

    const fromLibrary = (items ?? [])
      .filter((item) => (typeFilter === "all" ? true : item.mediaType === typeFilter))
      .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
      .filter((item) => (favouritesOnly ? item.favourite : true))
      .filter((item) => (listMediaKeys ? listMediaKeys.has(`${item.mediaType}-${item.mediaId}`) : true))
      .filter((item) => (smartListMediaKeys ? smartListMediaKeys.has(`${item.mediaType}-${item.mediaId}`) : true))
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

    // custom_list_items has no dependency on library_items (see
    // src-tauri/src/lists/custom/) — a list can hold media never
    // added to the library, which still needs to render here, just without
    // any status/rating/progress.
    const listOnly =
      listFilter === "all" || smartListFilter !== "all"
        ? []
        : (listItems.data ?? [])
            .filter((li) => !libraryByKey.has(`${li.mediaType}-${li.mediaId}`))
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

  // Shared between the server-paginated and client-filtered branches below —
  // "library has nothing at all" vs. "these filters just don't match" reads
  // the same way regardless of which query produced the empty result.
  const emptyLibraryState = (
    <EmptyState
      icon={LibraryBig}
      title={t("library.emptyTitle")}
      description={t("library.emptyDesc")}
      action={
        <Button asChild>
          <Link to="/search">{t("library.exploreCta")}</Link>
        </Button>
      }
    />
  );
  const noResultsState = (
    <EmptyState
      icon={SearchX}
      title={t("library.noResultsTitle")}
      description={t("library.noResultsDesc")}
      action={
        <Button type="button" variant="outline" onClick={clearFilters}>
          {t("library.clearFilters")}
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="w-full sm:w-64">
            <SearchBar value={search} onChange={setSearch} placeholder={t("library.searchPlaceholder")} />
          </div>
          {lockedMediaType ? null : (
            <FilterBar
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: t("settings.all") },
                { value: "series", label: t("nav.series") },
                { value: "movie", label: t("nav.movies") },
              ]}
            />
          )}
          <FilterBar
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions.map((status) => ({
              value: status,
              label: status === "all" ? t("settings.all") : t(`library.statuses.${status}`),
            }))}
          />
          <FilterBar
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: t("library.recent") },
              { value: "title", label: t("library.title") },
              { value: "rating", label: t("library.rating") },
            ]}
          />
          <Button
            type="button"
            variant={favouritesOnly ? "default" : "outline"}
            size="sm"
            aria-pressed={favouritesOnly}
            onClick={() => setFavouritesOnly((value) => !value)}
          >
            <Heart className={favouritesOnly ? "mr-2 size-4 fill-current" : "mr-2 size-4"} />
            {t("library.favouritesOnly")}
          </Button>
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            <IconTooltip label={t("library.gridView")}>
              <Button
                type="button"
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="icon"
                aria-label={t("library.gridView")}
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className="size-8 rounded-full"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </IconTooltip>
            <IconTooltip label={t("library.listView")}>
              <Button
                type="button"
                variant={viewMode === "list" ? "default" : "ghost"}
                size="icon"
                aria-label={t("library.listView")}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className="size-8 rounded-full"
              >
                <List className="size-4" />
              </Button>
            </IconTooltip>
          </div>
          {(lists.data?.length ?? 0) > 0 ? (
            <Select
              aria-label={t("library.lists.filterLabel")}
              value={listFilter}
              onChange={(event) => setListFilter(event.target.value)}
              className="max-w-48"
            >
              <option value="all">{t("library.lists.allLists")}</option>
              {lists.data?.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </Select>
          ) : null}
          {(smartLists.data?.length ?? 0) > 0 ? (
            <Select
              aria-label={t("library.smartLists.filterLabel")}
              value={smartListFilter}
              onChange={(event) => setSmartListFilter(event.target.value)}
              className="max-w-48"
            >
              <option value="all">{t("library.smartLists.noFilter")}</option>
              {smartLists.data?.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
        <SavedFiltersBar page="library" currentFilters={currentFilters} onApply={applySavedFilters} />
      </div>

      <ActiveFilterChips chips={chips} />

      {lockedMediaType ? null : (
        <Accordion type="single" collapsible className="space-y-3">
          <AccordionItem value="lists">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <FolderHeart className="size-4 text-primary" aria-hidden="true" />
                {t("library.lists.title")}
                {lists.data?.length ? (
                  <span className="font-normal text-muted-foreground">({lists.data.length})</span>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ListsAccordionContent lists={lists} listFilter={listFilter} onListDeleted={resetListFilter} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="smart-lists">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                {t("library.smartLists.title")}
                {smartLists.data?.length ? (
                  <span className="font-normal text-muted-foreground">({smartLists.data.length})</span>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <SmartListsAccordionContent
                smartLists={smartLists}
                activeSmartListId={smartListFilter}
                onSelectSmartList={setSmartListFilter}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {isServerPaginated ? (
        libraryPageQuery.isLoading ? (
          <GridSkeleton />
        ) : libraryPageQuery.isError ? (
          <RemoteErrorState error={libraryPageQuery.error} onRetry={() => void libraryPageQuery.refetch()} />
        ) : serverItems.length ? (
          viewMode === "grid" ? (
            <MediaGrid items={serverItems} onEndReached={loadNextServerPage} />
          ) : (
            <MediaList items={serverItems} onEndReached={loadNextServerPage} />
          )
        ) : !hasAnyLibraryItems ? (
          emptyLibraryState
        ) : (
          noResultsState
        )
      ) : libraryQuery.isLoading ||
        (isFilteredToList && listItems.isLoading) ||
        (smartListFilter !== "all" && smartListMatches.isLoading) ? (
        <GridSkeleton />
      ) : libraryQuery.isError ? (
        <RemoteErrorState error={libraryQuery.error} onRetry={() => void libraryQuery.refetch()} />
      ) : isFilteredToList && listItems.isError ? (
        <RemoteErrorState error={listItems.error} onRetry={() => void listItems.refetch()} />
      ) : smartListFilter !== "all" && smartListMatches.isError ? (
        <RemoteErrorState error={smartListMatches.error} onRetry={smartListMatches.refetch} />
      ) : filtered.length ? (
        lockedMediaType === "series" ? (
          <SeriesLibrarySections items={filtered} trackedSeries={trackedSeries ?? []} viewMode={viewMode} />
        ) : lockedMediaType === "movie" ? (
          <MovieLibrarySections items={filtered} viewMode={viewMode} />
        ) : viewMode === "grid" ? (
          <MediaGrid items={filtered} />
        ) : (
          <MediaList items={filtered} />
        )
      ) : !hasAnyLibraryItems ? (
        emptyLibraryState
      ) : (
        noResultsState
      )}

      {onBrowseAll && (isServerPaginated ? serverItems.length : filtered.length) ? (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" onClick={onBrowseAll}>
            {browseAllLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
