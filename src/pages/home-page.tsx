import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states/empty-state';
import { GridSkeleton, HeroSkeleton } from '@/components/states/loading-skeletons';
import { MediaGrid } from '@/components/media/media-grid';
import { SectionHeader } from '@/components/media/section-header';
import { StatCard } from '@/components/media/stat-card';
import { buildTmdbImageUrl } from '@/shared/utils/format';
import { hasTmdbToken } from '@/shared/config/env';
import { useHistory, useTrackedSeries, useWatchlist } from '@/hooks/use-local-media';
import { useHomeFeed } from '@/hooks/use-media';

export function HomePage() {
  const homeQuery = useHomeFeed();
  const watchlistQuery = useWatchlist();
  const trackedSeriesQuery = useTrackedSeries();
  const historyQuery = useHistory();

  if (!hasTmdbToken) {
    return (
      <EmptyState
        title="Configure ton accès TMDB"
        description="Ajoute ton bearer token TMDB dans .env sous la clé VITE_TMDB_API_TOKEN. L’app est déjà prête côté architecture, données locales et UI ; il manque juste l’authentification API pour charger le catalogue."
      />
    );
  }

  if (homeQuery.isLoading) {
    return (
      <div className="space-y-8">
        <HeroSkeleton />
        <GridSkeleton />
      </div>
    );
  }

  const hero = homeQuery.data?.popularMovies[0];
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
    }));

  return (
    <div className="space-y-10">
      {hero ? (
        <section className="relative overflow-hidden rounded-[36px] border border-white/5">
          <img
            src={buildTmdbImageUrl(hero.backdropPath, 'original')}
            alt={hero.title}
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/92 to-background/50" />
          <div className="relative grid gap-8 px-6 py-8 md:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-12">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">
                <Sparkles className="h-4 w-4" />
                Sélection premium
              </div>
              <h2 className="mt-5 text-4xl font-black text-balance md:text-6xl">{hero.title}</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
                {hero.overview}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/movies/$movieId" params={{ movieId: String(hero.id) }}>
                    Voir la fiche
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/search">Explorer le catalogue</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 self-end md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <StatCard
                label="Watchlist"
                value={String(watchlistQuery.data?.length ?? 0)}
                helper="Titres à voir plus tard"
              />
              <StatCard
                label="Séries suivies"
                value={String(trackedSeriesQuery.data?.length ?? 0)}
                helper="Progressions locales"
              />
              <StatCard
                label="Activité"
                value={String(historyQuery.data?.length ?? 0)}
                helper="Dernières actions enregistrées"
              />
            </div>
          </div>
        </section>
      ) : null}

      {continueWatching.length > 0 ? (
        <section>
          <SectionHeader
            title="Continuer à regarder"
            subtitle="Retrouve tes séries en cours en un clic."
          />
          <MediaGrid items={continueWatching} />
        </section>
      ) : null}

      <section>
        <SectionHeader title="Films populaires" subtitle="Une sélection visuelle soignée pour démarrer." />
        <MediaGrid items={homeQuery.data?.popularMovies ?? []} />
      </section>

      <section>
        <SectionHeader title="Séries à suivre" subtitle="Progression épisode par épisode, localement persistée." />
        <MediaGrid items={homeQuery.data?.popularSeries ?? []} />
      </section>
    </div>
  );
}
