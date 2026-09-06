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
import { CatalogMetadataSync } from "@/components/media/detail/catalog-metadata-sync";
import { ImdbLink } from "@/components/media/detail/imdb-link";
import { KeywordChips } from "@/components/media/detail/keyword-chips";
import { MediaGallery } from "@/components/media/detail/media-gallery";
import { ReviewsPanel } from "@/components/media/detail/reviews-panel";
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
import { FavouriteButton } from "@/components/media/tracking/favourite-button";
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
  const seasons = seasonQueries.map((query) => query.data).filter((season): season is Season => Boolean(season));
  const allSeasonsLoaded =
    seasonNumbers.length > 0 &&
    seasons.length === seasonNumbers.length &&
    seasonQueries.every((query) => !query.isPending && !query.isError);
  const progress = calculateSeriesProgress(id, seasons, progressQuery.data ?? []);
  // The card/row progress-bar color and episode count both read
  // tracked_series.status/total_episodes, a local cache that's only ever
  // written as a side effect of toggling an episode — a show nobody
  // re-toggles after it airs its finale (status) or after TMDB announces
  // more episodes (total_episodes, which a toggle only ever ratchets up)
  // keeps stale values forever otherwise. This page always has TMDB's
  // current status and, once every season has loaded, a real aired-episode
  // count in hand — the natural place to opportunistically write both
  // back; refreshTrackedSeriesStatus is a no-op in Rust when neither value
  // actually changed. total_episodes is withheld until allSeasonsLoaded so
  // a page that's still mid-fetch never stamps in a too-low partial count.
  const trackedSeriesQuery = useTrackedSeries();
  const refreshTrackedSeriesStatus = useRefreshTrackedSeriesStatus();
  useEffect(() => {
    const freshStatus = seriesQuery.data?.status;
    const tracked = trackedSeriesQuery.data?.find((item) => item.seriesId === id);
    if (!freshStatus || !tracked) return;
    const freshTotalEpisodes = allSeasonsLoaded ? progress.totalEpisodes : null;
    if (tracked.status === freshStatus && (freshTotalEpisodes === null || tracked.totalEpisodes === freshTotalEpisodes))
      return;
    void refreshTrackedSeriesStatus({ seriesId: id, status: freshStatus, totalEpisodes: freshTotalEpisodes });
  }, [
    seriesQuery.data?.status,
    trackedSeriesQuery.data,
    id,
    refreshTrackedSeriesStatus,
    allSeasonsLoaded,
    progress.totalEpisodes,
  ]);
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
  const failedSeasonQueries = seasonQueries.filter((query) => query.isError);
  const nextEpisode = getNextEpisode(seasons, progressQuery.data ?? []);

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={
          <>
            <AddToLibraryButton media={series} />
            <FavouriteButton media={series} />
            <AvailabilityAlertButton media={series} />
          </>
        }
        extra={
          <div className="flex flex-col gap-2">
            <SeenToggle
              seen={progress.completed}
              disabled={progressQuery.isSaving || progressQuery.isError || !allSeasonsLoaded}
              onToggle={() => void progressQuery.markSeriesSeen({ series, seasons, watched: !progress.completed })}
              celebrateOnSeen
            />
            {/* progressQuery failing falls back to an empty watched list (see
                `progress` above), which would otherwise show every episode as
                unwatched — disabling the bulk "mark whole series seen" toggle
                keeps that wrong read from being written back as if it were
                real, same guard movie-detail-page.tsx applies to its own
                single seen toggle. */}
            {progressQuery.isError ? <PartialErrorState message={t("media.seenStatusUnavailable")} /> : null}
            {failedSeasonQueries.length > 0 ? <PartialErrorState message={t("series.someSeasonsUnavailable")} /> : null}
          </div>
        }
      />
      <NextEpisodeCard
        episode={nextEpisode}
        isSaving={progressQuery.isSaving}
        onWatched={(episode, note) => void progressQuery.toggleEpisodeSeen({ series, episode, watched: true, note })}
      />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel tone="subtle" className="p-6">
          <SectionHeader title={t("media.overview")} />
          <p className="text-body-lg text-muted-foreground">{series.overview || t("media.noOverview")}</p>
          <KeywordChips keywords={series.keywords} />
        </Panel>
        <div className="space-y-4">
          <Panel tone="subtle" className="p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-overline font-bold uppercase text-muted-foreground">{t("series.currentProgress")}</p>
              {progress.isUpToDate ? <Badge variant="success">{t("media.upToDate")}</Badge> : null}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="font-display text-5xl font-bold leading-none">
                {progress.progressPercent}
                <span className="text-xl font-normal text-muted-foreground">%</span>
              </p>
              <p className="text-body-sm text-muted-foreground">
                {t("series.episodesFraction", { watched: progress.watchedEpisodes, total: progress.totalEpisodes })}
              </p>
            </div>
            <div className="mt-4">
              <ProgressBar value={progress.progressPercent} />
            </div>
          </Panel>
          <Panel tone="subtle" className="p-6">
            <SectionHeader title={t("series.seriesInfo")} />
            <div className="grid gap-2 text-body-sm">
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
            <div className="mt-4">
              <ImdbLink imdbId={series.imdbId} />
            </div>
          </Panel>
        </div>
      </section>
      <section>
        <SectionHeader title={t("media.cast")} />
        <CastList cast={series.cast} />
      </section>
      <MediaGallery backdropPaths={series.backdropPaths} />
      <TrailerPanel mediaType="series" mediaId={series.id} />
      <ProviderAvailability media={series} />
      <LibraryEditor media={series} />
      <CatalogMetadataSync media={series} />
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
      <ReviewsPanel reviews={series.reviews} />
      <RecommendationsPanel media={series} />
    </div>
  );
}
