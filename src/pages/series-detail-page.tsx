import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import type { Season } from "@/types/media";
import { AvailabilityAlertButton } from "@/components/media/detail/availability-alert-button";
import { ProviderAvailability } from "@/components/media/detail/provider-availability";
import { RecommendationsPanel } from "@/components/media/detail/recommendations-panel";
import { TrailerPanel } from "@/components/media/detail/trailer-panel";
import { LibraryEditor } from "@/components/library/library-editor";
import { CastList } from "@/components/media/detail/cast-list";
import { MediaDetailsHero } from "@/components/media/detail/media-details-hero";
import { NextEpisodeCard } from "@/components/media/tracking/next-episode-card";
import { ProgressBar } from "@/components/media/primitives/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { SeasonAccordion } from "@/components/media/detail/season-accordion";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { SeenToggle } from "@/components/media/tracking/seen-toggle";
import { WatchHistoryPanel } from "@/components/media/activity/watch-history-panel";
import { AddToLibraryButton } from "@/components/media/tracking/add-to-library-button";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { EmptyState } from "@/components/states/empty-state";
import { useImageCache } from "@/features/media/use-image-cache";
import {
  calculateSeriesProgress,
  getNextEpisode,
  useEpisodeProgress,
  useRefreshTrackedSeriesStatus,
  useTrackedSeries,
} from "@/features/progress/use-progress";
import { useSeriesDetails, useSeriesSeasons } from "@/features/media/use-media";

export function SeriesDetailPage() {
  const { t } = useTranslation();
  const { seriesId } = useParams({ from: "/series/$seriesId" });
  const { season: initialOpenSeason } = useSearch({ from: "/series/$seriesId" });
  const id = Number(seriesId);
  const seriesQuery = useSeriesDetails(id);
  const progressQuery = useEpisodeProgress(id);
  useImageCache([seriesQuery.data?.posterPath, seriesQuery.data?.backdropPath], ["w500", "original"]);
  const seasonNumbers = useMemo(
    () => (seriesQuery.data?.seasons ?? []).map((season) => season.seasonNumber).filter((number) => number > 0),
    [seriesQuery.data?.seasons]
  );
  const seasonQueries = useSeriesSeasons(id, seasonNumbers);
  // The card/row progress-bar color reads tracked_series.status, a local
  // cache that's only ever written as a side effect of toggling an episode
  // — a show nobody re-toggles after it airs its finale keeps a stale
  // status forever otherwise. This page always has TMDB's current status
  // in hand (a fresh fetch, never cached locally), so it's the natural
  // place to opportunistically write it back; refreshTrackedSeriesStatus is
  // a no-op in Rust when the status hasn't actually changed.
  const trackedSeriesQuery = useTrackedSeries();
  const refreshTrackedSeriesStatus = useRefreshTrackedSeriesStatus();
  useEffect(() => {
    const freshStatus = seriesQuery.data?.status;
    const tracked = trackedSeriesQuery.data?.find((item) => item.seriesId === id);
    if (!freshStatus || !tracked || tracked.status === freshStatus) return;
    void refreshTrackedSeriesStatus({ seriesId: id, status: freshStatus });
  }, [seriesQuery.data?.status, trackedSeriesQuery.data, id, refreshTrackedSeriesStatus]);
  // A malformed/non-numeric :seriesId never becomes a valid query (see
  // useSeriesDetails' `enabled: Number.isFinite(seriesId)`) — that used to
  // fall through every check below to a bare `return null`, a permanently
  // blank page with no loading indicator and no error message. Catching it
  // explicitly, before ever touching the query's pending state, means this
  // page is never blank: it's the skeleton, a real error, or the content.
  if (!Number.isFinite(id)) {
    return <EmptyState icon={TriangleAlert} title={t("pages.notFound")} description={t("pages.notFoundDesc")} />;
  }
  // isPending (not isLoading): in TanStack Query v5, isLoading is
  // `isPending && isFetching`, which is false for a query that's pending
  // but not actively fetching — briefly true while routing settles on a
  // fast series-to-series navigation. isPending alone covers "no data yet"
  // unconditionally, so this never falls through to the same blank-page gap.
  if (seriesQuery.isPending) return <HeroSkeleton />;
  if (seriesQuery.isError) {
    return <RemoteErrorState error={seriesQuery.error} onRetry={() => void seriesQuery.refetch()} />;
  }
  const series = seriesQuery.data;
  const seasons = seasonQueries.map((query) => query.data).filter((season): season is Season => Boolean(season));
  const failedSeasonQueries = seasonQueries.filter((query) => query.isError);
  const allSeasonsLoaded =
    seasonNumbers.length > 0 &&
    seasons.length === seasonNumbers.length &&
    seasonQueries.every((query) => !query.isPending && !query.isError);
  const progress = calculateSeriesProgress(id, seasons, progressQuery.data ?? []);
  const nextEpisode = getNextEpisode(seasons, progressQuery.data ?? []);

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={
          <>
            <AddToLibraryButton media={series} />
            <AvailabilityAlertButton media={series} />
          </>
        }
        extra={
          <div className="flex flex-col gap-2">
            <SeenToggle
              seen={progress.completed}
              disabled={progressQuery.isSaving || !allSeasonsLoaded}
              onToggle={() => void progressQuery.markSeriesSeen({ series, seasons, watched: !progress.completed })}
              celebrateOnSeen
            />
            {failedSeasonQueries.length > 0 ? <PartialErrorState message={t("series.someSeasonsUnavailable")} /> : null}
          </div>
        }
      />
      <LibraryEditor media={series} />
      <ProviderAvailability media={series} />
      <TrailerPanel mediaType="series" mediaId={series.id} />
      <NextEpisodeCard
        episode={nextEpisode}
        isSaving={progressQuery.isSaving}
        onWatched={(episode, note) => void progressQuery.toggleEpisodeSeen({ series, episode, watched: true, note })}
      />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel tone="subtle" className="p-6">
          <SectionHeader title={t("media.overview")} />
          <p className="font-serif text-base leading-7 text-muted-foreground md:text-lg">{series.overview}</p>
        </Panel>
        <div className="space-y-4">
          <Panel tone="subtle">
            <div className="flex items-center justify-between gap-2">
              <p className="text-overline font-bold uppercase text-muted-foreground">{t("series.currentProgress")}</p>
              {progress.isUpToDate ? <Badge variant="success">{t("media.upToDate")}</Badge> : null}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="font-display text-5xl font-bold leading-none">
                {progress.progressPercent}
                <span className="text-xl font-normal text-muted-foreground">%</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t("series.episodesFraction", { watched: progress.watchedEpisodes, total: progress.totalEpisodes })}
              </p>
            </div>
            <div className="mt-4">
              <ProgressBar value={progress.progressPercent} />
            </div>
          </Panel>
          <Panel tone="subtle">
            <SectionHeader title={t("series.seriesInfo")} />
            <div className="grid gap-2 text-sm">
              {[
                { label: t("media.seasons"), value: series.numberOfSeasons },
                { label: t("media.episodes"), value: series.numberOfEpisodes ?? "—" },
                { label: t("media.status"), value: series.status || "—" },
                { label: t("media.genres"), value: series.genres.join(", ") || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>
      <section>
        <SectionHeader title={t("series.seasonsAndEpisodes")} subtitle={t("series.seasonsAndEpisodesDesc")} />
        {failedSeasonQueries.length > 0 ? (
          <PartialErrorState
            message={t("series.someSeasonsUnavailable")}
            onRetry={() => failedSeasonQueries.forEach((query) => void query.refetch())}
          />
        ) : null}
        <SeasonAccordion
          series={{ ...series, numberOfEpisodes: series.numberOfEpisodes }}
          seasons={seasons}
          watchedEpisodes={progressQuery.data ?? []}
          isSaving={progressQuery.isSaving}
          onToggleEpisode={(episode, watched, note) =>
            progressQuery.toggleEpisodeSeen({ series, episode, watched, note })
          }
          onToggleEpisodes={(episodes, target) => progressQuery.markEpisodesSeen({ series, episodes, target })}
          onToggleSeason={(season, watched) => progressQuery.markSeasonSeen({ series, season, watched })}
          initialOpenSeason={initialOpenSeason}
        />
      </section>
      <WatchHistoryPanel mediaId={series.id} mediaType="series" />
      <RecommendationsPanel media={series} />
      <section>
        <SectionHeader title={t("media.cast")} />
        <CastList cast={series.cast} />
      </section>
    </div>
  );
}
