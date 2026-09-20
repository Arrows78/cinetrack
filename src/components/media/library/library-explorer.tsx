import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Download, FolderHeart, Heart, LibraryBig, ListPlus, SearchX, Sparkles, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ActiveFilterChips } from "@/components/media/library/active-filter-chips";
import { FilterBar } from "@/components/media/library/filter-bar";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { MediaList } from "@/components/media/primitives/media-list";
import { MovieLibrarySections, SeriesLibrarySections } from "@/components/media/library/library-sections";
import { SavedFiltersBar } from "@/components/media/library/saved-filters-bar";
import { SearchBar } from "@/components/media/primitives/search-bar";
import { SmartListsAccordionContent } from "@/components/media/library/smart-lists-panel";
import { useLibraryExplorer } from "@/components/media/library/use-library-explorer";
import type { LibrarySortMode } from "@/components/media/library/library-filtering";
import { ViewModeToggle } from "@/components/media/primitives/view-mode-toggle";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { DegradedModeBadge } from "@/components/states/degraded-mode-badge";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useCustomListItems } from "@/features/custom-lists/use-custom-lists";
import type { useCustomLists } from "@/features/custom-lists/use-custom-lists";
import { useMergedGenres } from "@/features/media/use-merged-genres";
import { partialExport } from "@/features/backup";
import { isDegradedRemoteError } from "@/shared/lib/errors";

function ListItemRow({
  listId,
  listName,
  listDescription,
}: {
  listId: string;
  listName: string;
  listDescription: string | null;
}) {
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
  if (!items.data?.length) {
    return (
      <EmptyState
        icon={ListPlus}
        title={t("library.lists.itemsEmptyTitle")}
        description={t("library.lists.itemsEmpty")}
        className="py-8"
      />
    );
  }
  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            partialExport.exportList({ id: listId, name: listName, description: listDescription }, items.data ?? [])
          }
        >
          <Download className="mr-2 size-4" />
          {t("library.lists.export")}
        </Button>
      </div>
      {items.data.map((item) => (
        <Tile
          key={`${item.mediaType}-${item.mediaId}`}
          className="flex items-center justify-between px-3 py-2 text-body-sm"
        >
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
      {removeError ? <p className="text-body-sm text-destructive">{removeError}</p> : null}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && !items.isSaving && setPendingRemoval(null)}
        title={t("library.lists.removeItemConfirmTitle", { title: pendingRemoval?.title })}
        description={t("library.lists.removeItemConfirmDescription")}
        confirmLabel={t("common.remove")}
        cancelLabel={t("common.cancel")}
        isConfirming={items.isSaving}
        onConfirm={() => {
          if (!pendingRemoval) return;
          setRemoveError(null);
          void items
            .remove({ mediaId: pendingRemoval.mediaId, mediaType: pendingRemoval.mediaType })
            .then(() => setPendingRemoval(null))
            .catch(() => setRemoveError(t("desktop.operationFailed")));
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
  const nameInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          ref={nameInputRef}
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
      {listActionError ? <p className="mt-3 text-body-sm text-destructive">{listActionError}</p> : null}
      {lists.isLoading ? (
        <LoadingState className="mt-4" />
      ) : lists.isError ? (
        <div className="mt-4">
          <RemoteErrorState error={lists.error} onRetry={() => void lists.refetch()} />
        </div>
      ) : !lists.data?.length ? (
        <EmptyState
          icon={ListPlus}
          title={t("library.lists.noListsTitle")}
          description={t("library.lists.noLists")}
          className="py-8"
          action={
            <Button type="button" variant="outline" onClick={() => nameInputRef.current?.focus()}>
              {t("library.lists.createFirstList")}
            </Button>
          }
        />
      ) : (
        <div className="mt-4 grid gap-2">
          {lists.data.map((list) => (
            <Tile key={list.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-body-sm font-medium"
                  aria-expanded={openedList === list.id}
                  aria-controls={`custom-list-items-${list.id}`}
                  onClick={() => setOpenedList((current) => (current === list.id ? null : list.id))}
                >
                  <span className="min-w-0 truncate">{list.name}</span>
                  {list.description ? (
                    <span className="min-w-0 truncate text-muted-foreground">{list.description}</span>
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
                  <ListItemRow listId={list.id} listName={list.name} listDescription={list.description} />
                </div>
              ) : null}
            </Tile>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={pendingDeleteList !== null}
        onOpenChange={(open) => !open && !lists.isSaving && setPendingDeleteList(null)}
        title={t("library.lists.deleteListConfirmTitle", { name: pendingDeleteList?.name })}
        description={t("library.lists.deleteListConfirmDescription")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isConfirming={lists.isSaving}
        onConfirm={() => {
          if (!pendingDeleteList) return;
          setListActionError(null);
          const deletedId = pendingDeleteList.id;
          void lists
            .remove(deletedId)
            .then(() => {
              if (listFilter === deletedId) onListDeleted(deletedId);
              setPendingDeleteList(null);
            })
            .catch(() => setListActionError(t("desktop.operationFailed")));
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
  const {
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
    genreFilter,
    setGenreFilter,
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
  } = useLibraryExplorer(lockedMediaType);
  const genres = useMergedGenres();
  const sortOptions: { value: LibrarySortMode; label: string }[] = [
    { value: "recent", label: t("library.recent") },
    { value: "title", label: t("library.title") },
    { value: "rating", label: t("library.rating") },
    { value: "dateAdded", label: t("library.dateAdded") },
    { value: "dateCompleted", label: t("library.dateCompleted") },
    // Only meaningful for a series-only view — a movie has no "next
    // episode", and the standalone /library page mixes both types.
    ...(lockedMediaType === "series" ? [{ value: "nextEpisode" as const, label: t("library.nextEpisode") }] : []),
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

  // smartListMatches aggregates several underlying queries (see
  // use-smart-list-matches.ts) into a single isError/error pair with no
  // isRefetchError of its own to check here — left out of this degraded-mode
  // check for that reason, unlike the three single-query sources below.
  const isDegraded = isServerPaginated
    ? libraryPageQuery.isRefetchError && isDegradedRemoteError(libraryPageQuery.error)
    : (libraryQuery.isRefetchError && isDegradedRemoteError(libraryQuery.error)) ||
      (isFilteredToList && listItems.isRefetchError && isDegradedRemoteError(listItems.error));

  return (
    <div className="space-y-6">
      {isDegraded ? <DegradedModeBadge /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="w-full sm:w-64">
          <SearchBar value={search} onChange={setSearch} placeholder={t("library.searchPlaceholder")} />
        </div>
        {lockedMediaType ? null : (
          <FilterBar
            value={typeFilter}
            onChange={setTypeFilter}
            groupLabel={t("library.filterType")}
            options={[
              { value: "all", label: t("filters.all") },
              { value: "series", label: t("filters.typeSeries") },
              { value: "movie", label: t("filters.typeMovies") },
            ]}
          />
        )}
        <FilterBar
          value={statusFilter}
          onChange={setStatusFilter}
          groupLabel={t("library.filterStatus")}
          options={statusOptions.map((status) => ({
            value: status,
            label: status === "all" ? t("filters.all") : t(`library.statuses.${status}`),
          }))}
        />
        <Select
          aria-label={t("library.filterGenre")}
          value={genreFilter}
          onChange={(event) => setGenreFilter(event.target.value)}
          className="max-w-48"
        >
          <option value="all">{t("library.allGenres")}</option>
          {genres.map((genre) => (
            <option key={genre.label} value={genre.label}>
              {t(genre.labelKey)}
            </option>
          ))}
        </Select>
        <FilterBar value={sort} onChange={setSort} groupLabel={t("library.sortBy")} options={sortOptions} />
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
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
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
        <SavedFiltersBar page="library" currentFilters={currentFilters} onApply={applySavedFilters} />
      </div>

      <ActiveFilterChips chips={chips} onClearAll={clearFilters} />

      {lockedMediaType ? null : (
        // "multiple" (not "single") so opening Smart Lists doesn't force-close
        // My Lists — the two are independent filter panels, not alternatives.
        <Accordion type="multiple" className="space-y-3">
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
