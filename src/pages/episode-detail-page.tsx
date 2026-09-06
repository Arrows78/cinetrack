import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { Calendar, ChevronLeft, ChevronRight, Clock4, ImageOff, NotebookPen, TriangleAlert } from "lucide-react";
import { AddWatchNoteDialog } from "@/components/media/tracking/add-watch-note-dialog";
import { MarkPreviousEpisodesDialog } from "@/components/media/tracking/mark-previous-episodes-dialog";
import { SeenToggle } from "@/components/media/tracking/seen-toggle";
import { AddToLibraryButton } from "@/components/media/tracking/add-to-library-button";
import { MediaDetailsHero } from "@/components/media/detail/media-details-hero";
import { WatchHistoryPanel } from "@/components/media/activity/watch-history-panel";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/states/empty-state";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useEpisodeSeenBacklogPrompt } from "@/features/progress/use-episode-seen-backlog-prompt";
import { hasAired, useEpisodeProgress } from "@/features/progress/use-progress";
import { useSeasonDetails, useSeriesDetails } from "@/features/media/use-media";
import type { Season } from "@/types/media";
import { buildTmdbImageUrl, formatDate, formatEpisodeCode, formatRating, formatRuntime } from "@/shared/utils/format";

export function EpisodeDetailPage() {
  const { t } = useTranslation();
  const { seriesId, seasonNumber, episodeNumber } = useParams({
    from: "/series/$seriesId/season/$seasonNumber/episode/$episodeNumber",
  });
  const parsedSeriesId = Number(seriesId);
  const parsedSeasonNumber = Number(seasonNumber);
  const parsedEpisodeNumber = Number(episodeNumber);
  const seriesQuery = useSeriesDetails(parsedSeriesId);
  const seasonQuery = useSeasonDetails(parsedSeriesId, parsedSeasonNumber);
  const progressQuery = useEpisodeProgress(parsedSeriesId);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);

  // Same backlog-prompt pattern as season-page.tsx/season-accordion.tsx:
  // marking this one episode watched can still offer to catch up on earlier
  // unwatched episodes of the same season.
  const backlog = useEpisodeSeenBacklogPrompt<Season>({
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
  if (
    !Number.isFinite(parsedSeriesId) ||
    !Number.isFinite(parsedSeasonNumber) ||
    !Number.isFinite(parsedEpisodeNumber)
  ) {
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
  const sortedEpisodes = season.episodes.slice().sort((a, b) => a.episodeNumber - b.episodeNumber);
  const episode = sortedEpisodes.find((item) => item.episodeNumber === parsedEpisodeNumber);
  if (!episode) {
    return <EmptyState icon={TriangleAlert} title={t("pages.notFound")} description={t("pages.notFoundDesc")} />;
  }
  const episodeIndex = sortedEpisodes.indexOf(episode);
  const previousEpisode = sortedEpisodes[episodeIndex - 1] ?? null;
  const nextEpisode = sortedEpisodes[episodeIndex + 1] ?? null;

  const watchedSet = new Set((progressQuery.data ?? []).map((item) => item.episodeId));
  const watched = watchedSet.has(episode.id);
  const isUnreleased = !watched && !hasAired(episode);
  const stillUrl = buildTmdbImageUrl(episode.stillPath, "w780");

  const episodeLinkParams = (targetEpisodeNumber: number) => ({
    seriesId: String(series.id),
    seasonNumber: String(season.seasonNumber),
    episodeNumber: String(targetEpisodeNumber),
  });

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={<AddToLibraryButton media={series} />}
        extra={
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <SeenToggle
                seen={watched}
                disabled={progressQuery.isSaving || progressQuery.isError || isUnreleased}
                onToggle={() =>
                  backlog.requestToggle(episode, !watched, season.episodes, watchedSet, undefined, season)
                }
                celebrateOnSeen
              />
              {!watched && !isUnreleased ? (
                <IconTooltip label={t("media.addWatchNoteAction")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("media.addWatchNoteAction")}
                    disabled={progressQuery.isSaving}
                    onClick={() => setNoteDialogOpen(true)}
                  >
                    <NotebookPen className="size-4" />
                  </Button>
                </IconTooltip>
              ) : null}
            </div>
            {/* progressQuery failing falls back to an empty watched set above,
                which would show this episode as unwatched — disabling the
                toggle keeps that wrong read from being written back as if it
                were real. */}
            {progressQuery.isError ? <PartialErrorState message={t("media.seenStatusUnavailable")} /> : null}
          </div>
        }
      />

      <Card>
        <SectionHeader
          title={episode.title}
          subtitle={`${formatEpisodeCode(season.seasonNumber, episode.episodeNumber, { padded: true })} · ${
            season.name || t("media.fallbackTitle", { number: season.seasonNumber })
          }`}
        />
        <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
          <div className="relative aspect-video overflow-hidden rounded-card bg-muted">
            {stillUrl ? (
              <img src={stillUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageOff className="size-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {formatDate(episode.airDate)}
              </span>
              {episode.runtime ? (
                <span className="flex items-center gap-1.5">
                  <Clock4 className="size-3.5" />
                  {formatRuntime(episode.runtime)}
                </span>
              ) : null}
              {episode.rating ? (
                <span
                  aria-label={t("media.ratingLabel", { rating: formatRating(episode.rating) })}
                  className="flex items-center gap-1 text-rating"
                >
                  <span aria-hidden="true">★</span>
                  <span className="font-semibold text-foreground">{formatRating(episode.rating)}</span>
                </span>
              ) : null}
            </div>
            <p className="text-body-lg text-muted-foreground">{episode.overview || t("media.noOverview")}</p>
          </div>
        </div>
      </Card>

      <WatchHistoryPanel mediaId={series.id} mediaType="series" episodeId={episode.id} />

      <div className="flex items-center justify-between gap-3">
        {previousEpisode ? (
          <Link
            to="/series/$seriesId/season/$seasonNumber/episode/$episodeNumber"
            params={episodeLinkParams(previousEpisode.episodeNumber)}
            aria-label={`${t("media.previousEpisode")}: ${previousEpisode.title}`}
            className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate" aria-hidden="true">
              {previousEpisode.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {nextEpisode ? (
          <Link
            to="/series/$seriesId/season/$seasonNumber/episode/$episodeNumber"
            params={episodeLinkParams(nextEpisode.episodeNumber)}
            aria-label={`${t("media.nextEpisode")}: ${nextEpisode.title}`}
            className="flex min-w-0 items-center gap-1.5 text-right text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="truncate" aria-hidden="true">
              {nextEpisode.title}
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
      <AddWatchNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        onConfirm={(note) => {
          setNoteDialogOpen(false);
          backlog.requestToggle(episode, true, season.episodes, watchedSet, note || undefined, season);
        }}
      />
    </div>
  );
}
