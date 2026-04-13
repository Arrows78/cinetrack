import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Season } from '@/types/media';
import { useParams } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CastList } from '@/components/media/cast-list';
import { MediaDetailsHero } from '@/components/media/media-details-hero';
import { SeasonAccordion } from '@/components/media/season-accordion';
import { SectionHeader } from '@/components/media/section-header';
import { WatchlistButton } from '@/components/media/watchlist-button';
import { HeroSkeleton } from '@/components/states/loading-skeletons';
import { useEpisodeProgress } from '@/hooks/use-local-media';
import { useSeriesDetails, useSeriesSeasons } from '@/hooks/use-media';
import { progressRepository } from '@/services/local/progress-repository';

export function SeriesDetailPage() {
  const { t } = useTranslation();
  const { seriesId } = useParams({ from: '/series/$seriesId' });
  const id = Number(seriesId);
  const seriesQuery = useSeriesDetails(id);
  const progressQuery = useEpisodeProgress(id);

  const seasonNumbers = useMemo(
    () =>
      (seriesQuery.data?.seasons ?? [])
        .map((season) => season.seasonNumber)
        .filter((seasonNumber) => seasonNumber > 0),
    [seriesQuery.data?.seasons],
  );
  const seasonQueries = useSeriesSeasons(id, seasonNumbers);

  if (seriesQuery.isLoading) return <HeroSkeleton />;
  if (!seriesQuery.data) return null;

  const series = seriesQuery.data;
  const seasons = seasonQueries.map((query) => query.data).filter((s): s is Season => Boolean(s));
  const progress = progressRepository.calculateSeriesProgress(
    id,
    seasons,
    progressQuery.data ?? [],
  );

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={series}
        actions={<WatchlistButton media={series} />}
        extra={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={progressQuery.isSaving || !seasons.length}
              onClick={() => progressQuery.markSeriesSeen({ series, seasons, watched: true })}
            >
              {t('series.markAllSeen')}
            </Button>
            <Button
              variant="outline"
              disabled={progressQuery.isSaving || !seasons.length}
              onClick={() => progressQuery.markSeriesSeen({ series, seasons, watched: false })}
            >
              {t('series.resetProgress')}
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <SectionHeader title={t('media.overview')} />
          <p className="text-sm leading-7 text-muted-foreground md:text-base">{series.overview}</p>
        </Card>
        <Card>
          <SectionHeader title={t('series.seriesInfo')} />
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div>
              <span className="text-foreground">{t('media.seasons')}:</span>{' '}
              {series.numberOfSeasons}
            </div>
            <div>
              <span className="text-foreground">{t('media.episodes')}:</span>{' '}
              {series.numberOfEpisodes ?? '—'}
            </div>
            <div>
              <span className="text-foreground">{t('series.status')}:</span> {series.status || '—'}
            </div>
            <div>
              <span className="text-foreground">{t('media.genres')}:</span>{' '}
              {series.genres.join(', ') || '—'}
            </div>
          </div>
          <div className="mt-5 rounded-3xl border border-white/5 bg-white/5 p-4">
            <p className="text-sm text-muted-foreground">{t('series.currentProgress')}</p>
            <p className="mt-2 text-2xl font-bold">{progress.progressPercent}%</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {progress.watchedEpisodes}/{progress.totalEpisodes} {t('history.episodesWatched')}
            </p>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader
          title={t('series.seasonsAndEpisodes')}
          subtitle={t('series.seasonsAndEpisodesDesc')}
        />
        <SeasonAccordion
          series={{ ...series, numberOfEpisodes: series.numberOfEpisodes }}
          seasons={seasons}
          watchedEpisodes={progressQuery.data ?? []}
          isSaving={progressQuery.isSaving}
          onToggleEpisode={(episode, watched) =>
            progressQuery.toggleEpisodeSeen({ series, episode, watched })
          }
          onToggleSeason={(season, watched) =>
            progressQuery.markSeasonSeen({ series, season, watched })
          }
        />
      </section>

      <section>
        <SectionHeader title={t('media.cast')} />
        <CastList cast={series.cast} />
      </section>
    </div>
  );
}
