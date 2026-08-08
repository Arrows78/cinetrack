import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { FilterBar } from "@/components/media/filter-bar";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { useWatchlist } from "@/features/watchlist/use-watchlist";

export function WatchlistPage() {
  const { t } = useTranslation();
  const { data: preferences } = usePreferences();
  const watchlistQuery = useWatchlist();
  const { data: items } = watchlistQuery;
  const { data: trackedSeries } = useTrackedSeries();
  const [selectedFilter, setSelectedFilter] = useState<"all" | "movie" | "series" | null>(null);
  const filter = selectedFilter ?? preferences?.defaultWatchlistFilter ?? "all";
  const [sort, setSort] = useState<"recent" | "title" | "rating">("recent");

  const filtered = useMemo(() => {
    const progressBySeries = new Map(
      (trackedSeries ?? []).map((series) => [
        series.seriesId,
        { watched: series.watchedEpisodes, total: series.totalEpisodes },
      ])
    );
    const base = (items ?? []).filter((item) => (filter === "all" ? true : item.mediaType === filter));
    return base
      .slice()
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
        return b.createdAt.localeCompare(a.createdAt);
      })
      .map((item) => ({
        id: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        overview: "",
        year: item.year,
        rating: item.rating,
        genres: [],
        cast: [],
        progress: item.mediaType === "series" ? progressBySeries.get(item.mediaId) : undefined,
      }));
  }, [items, trackedSeries, filter, sort]);

  return (
    <div className="space-y-8">
      {/* Header + filters */}
      <div className="flex flex-col gap-5">
        <SectionHeader title={t("nav.watchlist")} subtitle={t("watchlist.subtitle")} index={1} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterBar
            value={filter}
            onChange={setSelectedFilter}
            options={[
              { value: "all", label: t("settings.all") },
              { value: "series", label: t("nav.series") },
              { value: "movie", label: t("nav.movies") },
            ]}
          />
          <FilterBar
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: t("watchlist.recent") },
              { value: "title", label: t("watchlist.title") },
              { value: "rating", label: t("watchlist.rating") },
            ]}
          />
        </div>
      </div>

      {watchlistQuery.isLoading ? (
        <GridSkeleton />
      ) : watchlistQuery.isError ? (
        <RemoteErrorState error={watchlistQuery.error} onRetry={() => void watchlistQuery.refetch()} />
      ) : filtered.length ? (
        <MediaGrid items={filtered} />
      ) : (
        <EmptyState
          icon={Clapperboard}
          title={t("pages.emptyWatchlist")}
          description={t("watchlist.emptyDesc")}
          action={
            <Button asChild>
              <Link to="/search">{t("watchlist.exploreCta")}</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
