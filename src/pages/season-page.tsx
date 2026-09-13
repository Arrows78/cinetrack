import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { EpisodeCard } from "@/components/media/tracking/episode-card";
import { MarkPreviousEpisodesDialog } from "@/components/media/tracking/mark-previous-episodes-dialog";
import { MediaDetailsHero } from "@/components/media/detail/media-details-hero";
import { SeenToggle } from "@/components/media/tracking/seen-toggle";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { AddToLibraryButton } from "@/components/media/tracking/add-to-library-button";
import { EmptyState } from "@/components/states/empty-state";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { Card } from "@/components/ui/card";
import { useEpisodeProgress } from "@/features/progress/use-progress";
import { useEpisodeSeenBacklogPrompt } from "@/features/progress/use-episode-seen-backlog-prompt";
import { useSeasonDetails, useSeriesDetails } from "@/features/media/use-media";

export function SeasonPage() {
  const { t } = useTranslation();
  const { seriesId, seasonNumber } = useParams({ from: "/series/$seriesId/season/$seasonNumber" });
  const parsedSeriesId = Number(seriesId);
  const parsedSeasonNumber = Number(seasonNumber);
  const seriesQuery = useSeriesDetails(parsedSeriesId);
  const seasonQuery = useSeasonDetails(parsedSeriesId, parsedSeasonNumber);
  const progressQuery = useEpisodeProgress(parsedSeriesId);

  // Called only from the interactive episode list below, which never
  // renders before seriesQuery.data is loaded — the `if (!seriesQuery.data)`
  // guards just satisfy the type checker, not a real runtime path. Defined
  // above the early returns (rather than after, next to `series`/`season`)
  // because hooks can't follow a conditional return.
  const backlog = useEpisodeSeenBacklogPrompt({
    onMarkOne: (episode, watched, note) => {
      if (!seriesQuery.data) return;
      void progressQuery.toggleEpisodeSeen({ series: seriesQuery.data, episode, watched, note });
    },
    onMarkMany: (episodes, target) => {
      if (!seriesQuery.data) return;
      void progressQuery.markEpisodesSeen({ series: seriesQuery.data, episodes, target });
    },
  });

  // See series-detail-page.tsx's equivalent guard for why: a non-numeric id
  // and isPending-vs-isLoading both used to fall through to a bare `return
  // null` — a permanently blank page instead of a skeleton or an error.
  if (!Number.isFinite(parsedSeriesId) || !Number.isFinite(parsedSeasonNumber)) {
    return <EmptyState icon={TriangleAlert} title={t("pages.notFound")} description={t("pages.notFoundDesc")} />;
  }
  if (seriesQuery.isPending || seasonQuery.isPending) return <HeroSkeleton />;
  if (seriesQuery.isError || seasonQuery.isError) {
    return (
      <RemoteErrorState
        error={seriesQuery.error ?? seasonQuery.error}
        onRetry={() => {
          void seriesQuery.refetch();
          void seasonQuery.refetch();
        }}
      />
    );
  }

  const series = seriesQuery.data;
  const season = seasonQuery.data;
  const watchedSet = new Set((progressQuery.data ?? []).map((item) => item.episodeId));
  const allWatched = season.episodes.length > 0 && season.episodes.every((ep) => watchedSet.has(ep.id));

  // Same prev/next pattern as episode-detail-page.tsx, one level up: specials
  // (season 0) are excluded, matching series-detail-page.tsx's own season list.
  const sortedSeasonNumbers = (series.seasons ?? [])
    .map((item) => item.seasonNumber)
    .filter((number) => number > 0)
    .sort((a, b) => a - b);
  const seasonIndex = sortedSeasonNumbers.indexOf(season.seasonNumber);
  const previousSeasonNumber = seasonIndex > 0 ? sortedSeasonNumbers[seasonIndex - 1] : null;
  const nextSeasonNumber =
    seasonIndex >= 0 && seasonIndex < sortedSeasonNumbers.length - 1 ? sortedSeasonNumbers[seasonIndex + 1] : null;

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={<AddToLibraryButton media={series} />}
        extra={
          <div className="flex flex-col gap-2">
            <SeenToggle
              seen={allWatched}
              disabled={progressQuery.isSaving || progressQuery.isError}
              onToggle={() => void progressQuery.markSeasonSeen({ series, season, watched: !allWatched })}
              celebrateOnSeen
            />
            {/* progressQuery failing falls back to an empty watched set below,
                which would show every episode as unwatched — disabling the
                bulk "mark whole season seen" toggle keeps that wrong read
                from being written back as if it were real. */}
            {progressQuery.isError ? <PartialErrorState message={t("media.seenStatusUnavailable")} /> : null}
          </div>
        }
      />

      <Card>
        <SectionHeader
          title={season.name || t("media.fallbackTitle", { number: season.seasonNumber })}
          subtitle={t("media.episodesAvailable", { count: season.episodes.length })}
        />
        <div className="space-y-4">
          {season.episodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={{ ...episode, watched: watchedSet.has(episode.id) }}
              disabled={progressQuery.isSaving}
              seriesId={series.id}
              seasonNumber={season.seasonNumber}
              onToggleSeen={(note) =>
                backlog.requestToggle(
                  episode,
                  !watchedSet.has(episode.id),
                  season.episodes,
                  watchedSet,
                  note,
                  undefined
                )
              }
            />
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        {previousSeasonNumber !== null ? (
          <Link
            to="/series/$seriesId/season/$seasonNumber"
            params={{ seriesId: String(series.id), seasonNumber: String(previousSeasonNumber) }}
            aria-label={`${t("media.previousSeason")}: ${t("media.fallbackTitle", { number: previousSeasonNumber })}`}
            className="flex min-w-0 items-center gap-1.5 text-body-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate" aria-hidden="true">
              {t("media.fallbackTitle", { number: previousSeasonNumber })}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {nextSeasonNumber !== null ? (
          <Link
            to="/series/$seriesId/season/$seasonNumber"
            params={{ seriesId: String(series.id), seasonNumber: String(nextSeasonNumber) }}
            aria-label={`${t("media.nextSeason")}: ${t("media.fallbackTitle", { number: nextSeasonNumber })}`}
            className="flex min-w-0 items-center gap-1.5 text-right text-body-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="truncate" aria-hidden="true">
              {t("media.fallbackTitle", { number: nextSeasonNumber })}
            </span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        ) : (
          <span />
        )}
      </div>

      <MarkPreviousEpisodesDialog
        open={backlog.prompt !== null}
        onOpenChange={(open) => !open && backlog.dismiss()}
        previousCount={backlog.prompt?.previousUnwatched.length ?? 0}
        onOnlyThis={backlog.confirmOnlyThis}
        onIncludePrevious={backlog.confirmIncludePrevious}
        isApplying={progressQuery.isSaving}
      />
    </div>
  );
}
