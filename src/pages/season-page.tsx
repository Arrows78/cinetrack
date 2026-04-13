import { useParams } from '@tanstack/react-router';
import { EpisodeCard } from '@/components/media/episode-card';
import { MediaDetailsHero } from '@/components/media/media-details-hero';
import { SectionHeader } from '@/components/media/section-header';
import { WatchlistButton } from '@/components/media/watchlist-button';
import { HeroSkeleton } from '@/components/states/loading-skeletons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEpisodeProgress } from '@/hooks/use-local-media';
import { useSeasonDetails, useSeriesDetails } from '@/hooks/use-media';

export function SeasonPage() {
  const { seriesId, seasonNumber } = useParams({ from: '/series/$seriesId/season/$seasonNumber' });
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

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={<WatchlistButton media={series} />}
        extra={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => progressQuery.markSeasonSeen({ series, season, watched: true })}
            >
              Tout marquer vu
            </Button>
            <Button
              variant="outline"
              onClick={() => progressQuery.markSeasonSeen({ series, season, watched: false })}
            >
              Tout réinitialiser
            </Button>
          </div>
        }
      />

      <Card>
        <SectionHeader
          title={season.name || `Saison ${season.seasonNumber}`}
          subtitle={`${season.episodes.length} épisode(s) disponibles dans cette saison.`}
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
