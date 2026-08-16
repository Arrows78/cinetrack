import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { FolderHeart, Heart, LibraryBig, ListPlus, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FilterBar } from "@/components/media/filter-bar";
import { MediaGrid, type MediaGridItem } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tile } from "@/components/ui/tile";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useCustomListItems, useCustomLists } from "@/features/library/use-custom-lists";
import { useLibrary } from "@/features/library/use-library";
import { useTrackedSeries } from "@/features/progress/use-progress";
import type { LibraryStatus } from "@/types/media";

type StatusFilter = LibraryStatus | "all";

const statusOptions: StatusFilter[] = ["all", "planned", "watching", "paused", "completed", "dropped", "rewatching"];

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
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("library.lists.removeItem", { title: item.title })}
            onClick={() => setPendingRemoval({ mediaId: item.mediaId, mediaType: item.mediaType, title: item.title })}
          >
            <Trash2 className="size-4" />
          </Button>
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
                  onClick={() => setOpenedList((current) => (current === list.id ? null : list.id))}
                >
                  {list.name}
                  {list.description ? (
                    <span className="ml-2 truncate text-muted-foreground">{list.description}</span>
                  ) : null}
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("library.lists.deleteList", { name: list.name })}
                  onClick={() => setPendingDeleteList({ id: list.id, name: list.name })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {openedList === list.id ? (
                <div className="mt-3">
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

export function LibraryPage() {
  const { t } = useTranslation();
  const libraryQuery = useLibrary();
  const { data: items } = libraryQuery;
  const { data: trackedSeries } = useTrackedSeries();
  const lists = useCustomLists();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [sort, setSort] = useState<"recent" | "title" | "rating">("recent");
  const [listFilter, setListFilter] = useState("all");
  const listItems = useCustomListItems(listFilter === "all" ? "" : listFilter);

  const filtered = useMemo(() => {
    const progressBySeries = new Map(
      (trackedSeries ?? []).map((series) => [
        series.seriesId,
        { watched: series.watchedEpisodes, total: series.totalEpisodes },
      ])
    );
    const libraryByKey = new Map((items ?? []).map((item) => [`${item.mediaType}-${item.mediaId}`, item]));
    const listMediaKeys =
      listFilter === "all" ? null : new Set((listItems.data ?? []).map((li) => `${li.mediaType}-${li.mediaId}`));

    const fromLibrary = (items ?? [])
      .filter((item) => (typeFilter === "all" ? true : item.mediaType === typeFilter))
      .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
      .filter((item) => (favouritesOnly ? item.favourite : true))
      .filter((item) => (listMediaKeys ? listMediaKeys.has(`${item.mediaType}-${item.mediaId}`) : true))
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
        } as MediaGridItem,
      }));

    // custom_list_items has no dependency on library_items (see
    // src-tauri/src/commands/custom_lists.rs) — a list can hold media never
    // added to the library, which still needs to render here, just without
    // any status/rating/progress.
    const listOnly =
      listFilter === "all"
        ? []
        : (listItems.data ?? [])
            .filter((li) => !libraryByKey.has(`${li.mediaType}-${li.mediaId}`))
            .filter((li) => (typeFilter === "all" ? true : li.mediaType === typeFilter))
            .filter(() => statusFilter === "all" && !favouritesOnly)
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
  }, [items, trackedSeries, typeFilter, statusFilter, favouritesOnly, sort, listFilter, listItems.data]);

  const isFilteredToList = listFilter !== "all";
  const resetListFilter = () => setListFilter("all");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5">
        <SectionHeader title={t("library.myLibrary")} subtitle={t("library.subtitle")} index={1} />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterBar
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: t("settings.all") },
              { value: "series", label: t("nav.series") },
              { value: "movie", label: t("nav.movies") },
            ]}
          />
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
        </div>
      </div>

      <Accordion type="single" collapsible>
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
      </Accordion>

      {libraryQuery.isLoading || (isFilteredToList && listItems.isLoading) ? (
        <GridSkeleton />
      ) : libraryQuery.isError ? (
        <RemoteErrorState error={libraryQuery.error} onRetry={() => void libraryQuery.refetch()} />
      ) : isFilteredToList && listItems.isError ? (
        <RemoteErrorState error={listItems.error} onRetry={() => void listItems.refetch()} />
      ) : filtered.length ? (
        <MediaGrid items={filtered} />
      ) : isFilteredToList ? (
        <EmptyState
          icon={FolderHeart}
          title={t("library.lists.emptyListTitle")}
          description={t("library.lists.emptyListDesc")}
        />
      ) : (
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
      )}
    </div>
  );
}
