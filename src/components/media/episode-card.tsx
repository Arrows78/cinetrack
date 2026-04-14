import { useTranslation } from 'react-i18next'
import { Calendar, Clock4 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SeenToggle } from '@/components/media/seen-toggle'
import { buildTmdbImageUrl, formatDate, formatRuntime, formatRating } from '@/shared/utils/format'
import type { Episode } from '@/types/media'

export function EpisodeCard({
  episode,
  onToggleSeen,
  disabled,
}: {
  episode: Episode
  onToggleSeen: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  return (
    <Card className="rounded-[28px] p-0 overflow-hidden">
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="aspect-video md:aspect-auto">
          <img
            src={
              buildTmdbImageUrl(episode.stillPath, 'w500') ??
              'https://placehold.co/800x450/111827/e5e7eb?text=Episode'
            }
            alt={episode.title}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col justify-between gap-4 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                S{episode.seasonNumber.toString().padStart(2, '0')}E
                {episode.episodeNumber.toString().padStart(2, '0')}
              </Badge>
              <Badge variant="outline">★ {formatRating(episode.rating)}</Badge>
              {episode.watched ? <Badge>{t('media.seen')}</Badge> : null}
            </div>
            <h4 className="mt-3 text-lg font-semibold">{episode.title}</h4>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {formatDate(episode.airDate)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock4 className="h-4 w-4" />
                {formatRuntime(episode.runtime)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {episode.overview || t('episode.noOverview')}
            </p>
          </div>
          <div>
            <SeenToggle
              seen={Boolean(episode.watched)}
              disabled={disabled}
              onToggle={onToggleSeen}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
