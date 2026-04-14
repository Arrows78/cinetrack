import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { History, Clapperboard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/states/empty-state'
import { ProgressBar } from '@/components/media/progress-bar'
import { SectionHeader } from '@/components/media/section-header'
import { formatRelativeDate, percent } from '@/shared/utils/format'
import { useHistory, useTrackedSeries } from '@/hooks/use-local-media'

const labelByAction = {
  'movie:watched': 'movieWatched',
  'movie:unwatched': 'movieUnwatched',
  'episode:watched': 'episodeWatched',
  'episode:unwatched': 'episodeUnwatched',
  'watchlist:add': 'addedToWatchlist',
  'watchlist:remove': 'removedFromWatchlist',
}

export function HistoryPage() {
  const { t } = useTranslation()
  const historyQuery = useHistory()
  const trackedSeriesQuery = useTrackedSeries()

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-4">
        <SectionHeader
          title={t('history.recentActivity')}
          subtitle={t('history.recentActivitySubtitle')}
        />
        {historyQuery.data?.length ? (
          historyQuery.data.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge>{t(`history.actions.${labelByAction[item.action]}`)}</Badge>
                  <p className="mt-3 text-lg font-semibold">{item.title}</p>
                  {item.episodeTitle ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      S{item.seasonNumber}E{item.episodeNumber} · {item.episodeTitle}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatRelativeDate(item.timestamp)}
                </p>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState
            icon={History}
            title={t('history.noActivity')}
            description={t('history.noActivityDesc')}
          />
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          title={t('history.seriesInProgress')}
          subtitle={t('history.seriesInProgressSubtitle')}
        />
        {(trackedSeriesQuery.data ?? []).length ? (
          trackedSeriesQuery.data?.map((item) => {
            const progress = percent(item.watchedEpisodes, item.totalEpisodes)
            return (
              <Card key={item.seriesId}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.watchedEpisodes}/{item.totalEpisodes} {t('history.episodesWatched')}
                    </p>
                  </div>
                  <Link
                    to="/series/$seriesId"
                    params={{ seriesId: String(item.seriesId) }}
                    className="text-sm text-primary"
                  >
                    {t('common.open')}
                  </Link>
                </div>
                <div className="mt-4">
                  <ProgressBar value={progress} label={`${progress}% ${t('history.completed')}`} />
                </div>
              </Card>
            )
          })
        ) : (
          <EmptyState
            icon={Clapperboard}
            title={t('history.noTrackedSeries')}
            description={t('history.noTrackedSeriesDesc')}
          />
        )}
      </section>
    </div>
  )
}
