import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { EpisodeCard } from "@/components/media/episode-card";
import { MediaDetailsHero } from "@/components/media/media-details-hero";
import { SeenToggle } from "@/components/media/seen-toggle";
import { SectionHeader } from "@/components/media/section-header";
import { AddToLibraryButton } from "@/components/media/add-to-library-button";
import { EmptyState } from "@/components/states/empty-state";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { Card } from "@/components/ui/card";
import { useEpisodeProgress } from "@/features/progress/use-progress";
import { useSeasonDetails, useSeriesDetails } from "@/features/media/use-media";

export function SeasonPage() {
  const { t } = useTranslation();
  const { seriesId, seasonNumber } = useParams({ from: "/series/$seriesId/season/$seasonNumber" });
  const parsedSeriesId = Number(seriesId);
  const parsedSeasonNumber = Number(seasonNumber);
  const seriesQuery = useSeriesDetails(parsedSeriesId);
  const seasonQuery = useSeasonDetails(parsedSeriesId, parsedSeasonNumber);
  const progressQuery = useEpisodeProgress(parsedSeriesId);

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

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={<AddToLibraryButton media={series} />}
        extra={
          <SeenToggle
            seen={allWatched}
            disabled={progressQuery.isSaving}
            onToggle={() => void progressQuery.markSeasonSeen({ series, season, watched: !allWatched })}
            celebrateOnSeen
          />
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
              onToggleSeen={(note) =>
                void progressQuery.toggleEpisodeSeen({
                  series,
                  episode,
                  watched: !watchedSet.has(episode.id),
                  note,
                })
              }
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
