import { useTranslation } from 'react-i18next'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/states/empty-state'
import { GridSkeleton, HeroSkeleton } from '@/components/states/loading-skeletons'
import { MediaGrid } from '@/components/media/media-grid'
import { SectionHeader } from '@/components/media/section-header'
import { StatCard } from '@/components/media/stat-card'
import { buildTmdbImageUrl } from '@/shared/utils/format'
import { hasTmdbToken } from '@/shared/config/env'
import { useHistory, useTrackedSeries, useWatchlist } from '@/hooks/use-local-media'
import { useHomeFeed } from '@/hooks/use-media'

export function HomePage() {
  const { t } = useTranslation()
  const homeQuery = useHomeFeed()
  const watchlistQuery = useWatchlist()
  const trackedSeriesQuery = useTrackedSeries()
  const historyQuery = useHistory()

  if (!hasTmdbToken) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t('home.configureTmdb')}
        description={t('home.configureTmdbDesc')}
      />
    )
  }

  if (homeQuery.isLoading) {
    return (
      <div className="space-y-10">
        <HeroSkeleton />
        <GridSkeleton />
      </div>
    )
  }

  const hero = homeQuery.data?.trendingMovies[0]
  const continueWatching = (trackedSeriesQuery.data ?? [])
    .filter((item) => item.watchedEpisodes > 0 && item.watchedEpisodes < item.totalEpisodes)
    .slice(0, 5)
    .map((item) => ({
      id: item.seriesId,
      mediaType: 'series' as const,
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      overview: '',
      year: null,
      rating: null,
      genres: [],
      cast: [],
    }))

  let sectionIndex = 0

  return (
    <div className="space-y-12">
      {/* Cinematic hero */}
      {hero ? (
        <section className="relative overflow-hidden rounded-[36px] border border-border">
          {/* Backdrop */}
          <img
            src={buildTmdbImageUrl(hero.backdropPath, 'original')}
            alt={hero.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Cinematic overlay */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(108deg, hsl(var(--background)) 0%, hsl(var(--background)/0.93) 38%, hsl(var(--background)/0.55) 68%, hsl(var(--background)/0.15) 100%)',
            }}
          />
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/60 to-transparent" />

          <div className="relative px-6 py-8 lg:px-8 lg:py-10">
            {/* Premium badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-primary uppercase">
              <Sparkles className="h-3 w-3" />
              {t('home.premiumSelection')}
            </div>

            {/* Title */}
            <h2 className="mt-5 max-w-2xl font-display text-3xl font-bold leading-[1.05] text-balance text-card-foreground md:text-5xl lg:text-6xl">
              {hero.title}
            </h2>

            {/* Overview */}
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground md:text-[14px]">
              {hero.overview}
            </p>

            {/* Stats row */}
            <div className="mt-6 flex flex-wrap items-center gap-6 pt-5">
              <StatCard
                label={t('home.followedSeries')}
                value={String(trackedSeriesQuery.data?.length ?? 0)}
                helper={t('home.trackedHelper')}
              />
              <StatCard
                label={t('nav.watchlist')}
                value={String(watchlistQuery.data?.length ?? 0)}
                helper={t('home.watchlistHelper')}
              />
              <StatCard
                label={t('nav.history')}
                value={String(historyQuery.data?.length ?? 0)}
                helper={t('home.activityHelper')}
              />
            </div>

            {/* Actions */}
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/movies/$movieId" params={{ movieId: String(hero.id) }}>
                  {t('home.viewDetails')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/search">{t('home.exploreCatalog')}</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Continue watching */}
      {continueWatching.length > 0 ? (
        <section>
          <SectionHeader
            title={t('home.continueWatching')}
            subtitle={t('home.continueWatchingDesc')}
            index={++sectionIndex}
          />
          <MediaGrid items={continueWatching} />
        </section>
      ) : null}

      {/* Trending series */}
      <section>
        <SectionHeader
          title={t('home.trendingSeries')}
          subtitle={t('home.trendingSeriesSubtitle')}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.popularSeries ?? []} />
      </section>

      {/* Trending movies */}
      <section>
        <SectionHeader
          title={t('home.trendingMovies')}
          subtitle={t('home.trendingMoviesSubtitle')}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.trendingMovies ?? []} />
      </section>
    </div>
  )
}
