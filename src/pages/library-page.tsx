import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Heart, LibraryBig } from "lucide-react";
import { FilterBar } from "@/components/media/filter-bar";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useLibrary } from "@/features/library/use-library";
import { useTrackedSeries } from "@/features/progress/use-progress";
import type { LibraryStatus } from "@/types/media";

type StatusFilter = LibraryStatus | "all";

const statusOptions: StatusFilter[] = ["all", "planned", "watching", "paused", "completed", "dropped", "rewatching"];

export function LibraryPage() {
  const { t } = useTranslation();
  const libraryQuery = useLibrary();
  const { data: items } = libraryQuery;
  const { data: trackedSeries } = useTrackedSeries();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [sort, setSort] = useState<"recent" | "title" | "rating">("recent");

  const filtered = useMemo(() => {
    const progressBySeries = new Map(
      (trackedSeries ?? []).map((series) => [
        series.seriesId,
        { watched: series.watchedEpisodes, total: series.totalEpisodes },
      ])
    );
    const base = (items ?? [])
      .filter((item) => (typeFilter === "all" ? true : item.mediaType === typeFilter))
      .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
      .filter((item) => (favouritesOnly ? item.favourite : true));
    return base
      .slice()
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "rating") return (b.userRating ?? 0) - (a.userRating ?? 0);
        return b.updatedAt.localeCompare(a.updatedAt);
      })
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
      }));
  }, [items, trackedSeries, typeFilter, statusFilter, favouritesOnly, sort]);

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
        </div>
      </div>

      {libraryQuery.isLoading ? (
        <GridSkeleton />
      ) : libraryQuery.isError ? (
        <RemoteErrorState error={libraryQuery.error} onRetry={() => void libraryQuery.refetch()} />
      ) : filtered.length ? (
        <MediaGrid items={filtered} />
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
