import { Link } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/states/empty-state';
import { ProgressBar } from '@/components/media/progress-bar';
import { SectionHeader } from '@/components/media/section-header';
import { formatRelativeDate, percent } from '@/shared/utils/format';
import { useHistory, useTrackedSeries } from '@/hooks/use-local-media';

const labelByAction = {
  'movie:watched': 'Film vu',
  'movie:unwatched': 'Film retiré du vu',
  'episode:watched': 'Épisode vu',
  'episode:unwatched': 'Épisode retiré du vu',
  'watchlist:add': 'Ajout watchlist',
  'watchlist:remove': 'Suppression watchlist',
};

export function HistoryPage() {
  const historyQuery = useHistory();
  const trackedSeriesQuery = useTrackedSeries();

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-4">
        <SectionHeader title="Activité récente" subtitle="Films vus, épisodes marqués et mouvements de watchlist." />
        {historyQuery.data?.length ? (
          historyQuery.data.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge>{labelByAction[item.action]}</Badge>
                  <p className="mt-3 text-lg font-semibold">{item.title}</p>
                  {item.episodeTitle ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      S{item.seasonNumber}E{item.episodeNumber} · {item.episodeTitle}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{formatRelativeDate(item.timestamp)}</p>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState
            title="Pas encore d’activité"
            description="Commence à marquer des contenus vus ou à remplir ta watchlist pour alimenter cette section."
          />
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader title="Séries en cours" subtitle="Ta progression locale sur les séries suivies." />
        {(trackedSeriesQuery.data ?? []).length ? (
          trackedSeriesQuery.data?.map((item) => {
            const progress = percent(item.watchedEpisodes, item.totalEpisodes);
            return (
              <Card key={item.seriesId}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.watchedEpisodes}/{item.totalEpisodes} épisodes vus
                    </p>
                  </div>
                  <Link
                    to="/series/$seriesId"
                    params={{ seriesId: String(item.seriesId) }}
                    className="text-sm text-primary"
                  >
                    Ouvrir
                  </Link>
                </div>
                <div className="mt-4">
                  <ProgressBar value={progress} label={`${progress}% complété`} />
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState
            title="Aucune série suivie"
            description="Dès que tu coches un épisode, la progression apparaît ici avec persistance locale."
          />
        )}
      </section>
    </div>
  );
}
