import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/media/progress-bar';
import { EpisodeCard } from '@/components/media/episode-card';
import type { EpisodeProgress, MediaSummary, Season } from '@/types/media';
import { progressRepository } from '@/services/local/progress-repository';

export function SeasonAccordion({
  series,
  seasons,
  watchedEpisodes,
  onToggleEpisode,
  onToggleSeason,
  isSaving,
}: {
  series: MediaSummary & { numberOfEpisodes?: number };
  seasons: Season[];
  watchedEpisodes: EpisodeProgress[];
  onToggleEpisode: (episode: Season['episodes'][number], watched: boolean) => Promise<void>;
  onToggleSeason: (season: Season, watched: boolean) => Promise<void>;
  isSaving?: boolean;
}) {
  const { t } = useTranslation();
  const watchedSet = new Set(watchedEpisodes.map((item) => item.episodeId));
  const progress = progressRepository.calculateSeriesProgress(series.id, seasons, watchedEpisodes);

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-white/5 bg-card/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('series.globalProgress')}</p>
            <p className="text-xl font-semibold">
              {progress.watchedEpisodes} / {progress.totalEpisodes} {t('history.episodesWatched')}
            </p>
          </div>
          <div className="w-full max-w-sm">
            <ProgressBar
              value={progress.progressPercent}
              label={`${progress.progressPercent}% ${t('history.completed')}`}
            />
          </div>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-4">
        {seasons.map((season) => {
          const seasonProgress = progress.seasons.find(
            (item) => item.seasonNumber === season.seasonNumber,
          );
          return (
            <AccordionItem key={season.seasonNumber} value={`season-${season.seasonNumber}`}>
              <AccordionTrigger>
                <div className="w-full">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold">
                        {season.name || `${t('media.season')} ${season.seasonNumber}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {seasonProgress?.watchedEpisodes ?? 0} / {season.episodes.length}{' '}
                        {t('history.episodesWatched')}
                      </p>
                    </div>
                    <div className="w-full max-w-xs">
                      <ProgressBar value={seasonProgress?.progressPercent ?? 0} />
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="mb-5 flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => onToggleSeason(season, true)}
                    disabled={isSaving}
                  >
                    {t('series.markSeasonSeen')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onToggleSeason(season, false)}
                    disabled={isSaving}
                  >
                    {t('series.resetSeason')}
                  </Button>
                  <Button asChild variant="ghost">
                    <Link
                      to="/series/$seriesId/season/$seasonNumber"
                      params={{
                        seriesId: String(series.id),
                        seasonNumber: String(season.seasonNumber),
                      }}
                    >
                      {t('series.openDedicatedPage')}
                    </Link>
                  </Button>
                </div>
                <div className="space-y-4">
                  {season.episodes.map((episode) => (
                    <EpisodeCard
                      key={episode.id}
                      episode={{ ...episode, watched: watchedSet.has(episode.id) }}
                      disabled={isSaving}
                      onToggleSeen={() => onToggleEpisode(episode, !watchedSet.has(episode.id))}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
