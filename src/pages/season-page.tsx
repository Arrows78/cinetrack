import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { EpisodeCard } from "@/components/media/episode-card";
import { MediaDetailsHero } from "@/components/media/media-details-hero";
import { SeenToggle } from "@/components/media/seen-toggle";
import { SectionHeader } from "@/components/media/section-header";
import { WatchlistButton } from "@/components/media/watchlist-button";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { Card } from "@/components/ui/card";
import { useEpisodeProgress } from "@/hooks/use-local-media";
import { useSeasonDetails, useSeriesDetails } from "@/hooks/use-media";

export function SeasonPage() {
  const { t } = useTranslation();
  const { seriesId, seasonNumber } = useParams({ from: "/series/$seriesId/season/$seasonNumber" });
  const parsedSeriesId = Number(seriesId);
  const parsedSeasonNumber = Number(seasonNumber);
  const seriesQuery = useSeriesDetails(parsedSeriesId);
  const seasonQuery = useSeasonDetails(parsedSeriesId, parsedSeasonNumber);
  const progressQuery = useEpisodeProgress(parsedSeriesId);

  if (seriesQuery.isLoading || seasonQuery.isLoading) return <HeroSkeleton />;
  if (!seriesQuery.data || !seasonQuery.data) return null;

  const series = seriesQuery.data;
  const season = seasonQuery.data;
  const watchedSet = new Set((progressQuery.data ?? []).map((item) => item.episodeId));
  const allWatched = season.episodes.length > 0 && season.episodes.every((ep) => watchedSet.has(ep.id));

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={<WatchlistButton media={series} />}
        extra={
          <SeenToggle
            seen={allWatched}
            disabled={progressQuery.isSaving}
            onToggle={() => progressQuery.markSeasonSeen({ series, season, watched: !allWatched })}
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
              onToggleSeen={() =>
                progressQuery.toggleEpisodeSeen({
                  series,
                  episode,
                  watched: !watchedSet.has(episode.id),
                })
              }
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
