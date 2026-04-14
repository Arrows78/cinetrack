import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard } from 'lucide-react'
import { FilterBar } from '@/components/media/filter-bar'
import { MediaGrid } from '@/components/media/media-grid'
import { SectionHeader } from '@/components/media/section-header'
import { EmptyState } from '@/components/states/empty-state'
import { usePreferences, useWatchlist } from '@/hooks/use-local-media'

export function WatchlistPage() {
  const { t } = useTranslation()
  const { data: preferences } = usePreferences()
  const { data: items } = useWatchlist()
  const [filter, setFilter] = useState<'all' | 'movie' | 'series'>(
    preferences?.defaultWatchlistFilter ?? 'all'
  )
  const [sort, setSort] = useState<'recent' | 'title' | 'rating'>('recent')

  const filtered = useMemo(() => {
    const base = (items ?? []).filter((item) =>
      filter === 'all' ? true : item.mediaType === filter
    )
    return base
      .slice()
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title)
        if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
        return b.createdAt.localeCompare(a.createdAt)
      })
      .map((item) => ({
        id: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        overview: '',
        year: item.year,
        rating: item.rating,
        genres: [],
        cast: [],
      }))
  }, [items, filter, sort])

  return (
    <div className="space-y-6">
      <section className="surface rounded-[32px] p-6">
        <SectionHeader title={t('nav.watchlist')} subtitle={t('watchlist.subtitle')} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterBar
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('settings.all') },
              { value: 'movie', label: t('nav.movies') },
              { value: 'series', label: t('nav.series') },
            ]}
          />
          <FilterBar
            value={sort}
            onChange={setSort}
            options={[
              { value: 'recent', label: t('watchlist.recent') },
              { value: 'title', label: t('watchlist.title') },
              { value: 'rating', label: t('watchlist.rating') },
            ]}
          />
        </div>
      </section>

      {filtered.length ? (
        <MediaGrid items={filtered} />
      ) : (
        <EmptyState
          icon={Clapperboard}
          title={t('pages.emptyWatchlist')}
          description={t('watchlist.emptyDesc')}
        />
      )}
    </div>
  )
}
