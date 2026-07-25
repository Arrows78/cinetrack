import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton, HeroSkeleton } from "@/components/states/loading-skeletons";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { StatCard } from "@/components/media/stat-card";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { hasTmdbToken } from "@/shared/config/env";
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import { useHistory, useTrackedSeries, useWatchlist } from "@/hooks/use-local-media";
import { useHomeFeed } from "@/hooks/use-media";

// Merge genres (same label = same genre across movies and series)
const useMergedGenres = () =>
  useMemo(() => {
    const seen = new Map<string, { id: number; label: string; icon: string; movieId: number; seriesId: number }>();
    for (const g of GENRES.movies) {
      const seriesMatch = GENRES.series.find((s) => s.label === g.label);
      seen.set(g.label, { id: g.id, label: g.label, icon: g.icon, movieId: g.id, seriesId: seriesMatch?.id ?? 0 });
    }
    for (const g of GENRES.series) {
      if (!seen.has(g.label)) {
        const movieMatch = GENRES.movies.find((m) => m.label === g.label);
        seen.set(g.label, {
          id: g.id,
          label: g.label,
          icon: g.icon,
          movieId: movieMatch?.id ?? 0,
          seriesId: g.id,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, []);

export function HomePage() {
  const { t } = useTranslation();
  const homeQuery = useHomeFeed();
  const watchlistQuery = useWatchlist();
  const trackedSeriesQuery = useTrackedSeries();
  const historyQuery = useHistory();
  const mergedGenres = useMergedGenres();

  if (!hasTmdbToken) {
    return <EmptyState icon={Sparkles} title={t("home.configureTmdb")} description={t("home.configureTmdbDesc")} />;
  }

  if (homeQuery.isLoading) {
    return (
      <div className="space-y-10">
        <HeroSkeleton />
        <GridSkeleton />
      </div>
    );
  }

  const hero = homeQuery.data?.trendingMovies[0];
  const continueWatching = (trackedSeriesQuery.data ?? [])
    .filter((item) => item.watchedEpisodes > 0 && item.watchedEpisodes < item.totalEpisodes)
    .slice(0, 5)
    .map((item) => ({
      id: item.seriesId,
      mediaType: "series" as const,
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      overview: "",
      year: null,
      rating: null,
      genres: [],
      cast: [],
    }));

  let sectionIndex = 0;

  return (
    <div className="space-y-12">
      {/* Cinematic hero */}
      {hero ? (
        <section className="relative overflow-hidden rounded-[36px] border border-border animate-in-up">
          {/* Backdrop */}
          <img
            src={buildTmdbImageUrl(hero.backdropPath, "original")}
            alt={hero.title}
            className="absolute inset-0 h-full w-full object-cover scale-105"
          />
          {/* Cinematic overlay */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(108deg, hsl(var(--background)) 0%, hsl(var(--background)/0.93) 38%, hsl(var(--background)/0.55) 68%, hsl(var(--background)/0.15) 100%)",
            }}
          />
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/60 to-transparent" />

          <div className="relative px-6 py-8 lg:px-8 lg:py-10">
            {/* Premium badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-primary uppercase animate-in delay-200">
              <Sparkles className="h-3 w-3" />
              {t("home.premiumSelection")}
            </div>

            {/* Title */}
            <h2 className="mt-5 max-w-2xl font-display text-4xl font-bold leading-[1.05] text-balance text-card-foreground md:text-5xl lg:text-6xl animate-in delay-300 hero-title-reveal">
              {hero.title}
            </h2>

            {/* Overview */}
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground md:text-[14px] animate-in delay-500">
              {hero.overview}
            </p>

            {/* Stats row */}
            <div className="mt-6 flex flex-wrap items-center gap-6 pt-5 animate-in delay-600">
              <StatCard
                label={t("home.followedSeries")}
                value={String(trackedSeriesQuery.data?.length ?? 0)}
                helper={t("home.trackedHelper")}
              />
              <StatCard
                label={t("nav.watchlist")}
                value={String(watchlistQuery.data?.length ?? 0)}
                helper={t("home.watchlistHelper")}
              />
              <StatCard
                label={t("nav.history")}
                value={String(historyQuery.data?.length ?? 0)}
                helper={t("home.activityHelper")}
              />
            </div>

            {/* Actions */}
            <div className="mt-7 flex flex-wrap gap-3 animate-in delay-700">
              <Button asChild size="lg" className="gap-2 transition-all duration-300 hover:shadow-[0_0_30px_hsl(var(--primary)/0.3)] hover:scale-[1.02]">
                <Link to="/movies/$movieId" params={{ movieId: String(hero.id) }}>
                  {t("home.viewDetails")}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="transition-all duration-300 hover:bg-primary/10 hover:border-primary/40">
                <Link to="/search">{t("home.exploreCatalog")}</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Continue watching */}
      {continueWatching.length > 0 ? (
        <section>
          <SectionHeader
            title={t("home.continueWatching")}
            subtitle={t("home.continueWatchingDesc")}
            index={++sectionIndex}
          />
          <MediaGrid items={continueWatching} />
        </section>
      ) : null}

      {/* === SERIES SECTIONS === */}

      {/* Trending Series */}
      <section>
        <SectionHeader
          title={t("home.trendingSeries")}
          subtitle={t("home.trendingSeriesSubtitle")}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.trendingSeries ?? []} />
      </section>

      {/* Top Rated Series */}
      <section>
        <SectionHeader
          title={t("home.topRatedSeries")}
          subtitle={t("home.topRatedSeriesSubtitle")}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.topRatedSeries ?? []} />
      </section>

      {/* On The Air */}
      <section>
        <SectionHeader
          title={t("home.onTheAirSeries")}
          subtitle={t("home.onTheAirSeriesSubtitle")}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.onTheAirSeries ?? []} />
      </section>

      {/* === MOVIES SECTIONS === */}

      {/* Trending Movies */}
      <section>
        <SectionHeader
          title={t("home.trendingMovies")}
          subtitle={t("home.trendingMoviesSubtitle")}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.trendingMovies ?? []} />
      </section>

      {/* Top Rated Movies */}
      <section>
        <SectionHeader
          title={t("home.topRatedMovies")}
          subtitle={t("home.topRatedMoviesSubtitle")}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.topRatedMovies ?? []} />
      </section>

      {/* Now Playing */}
      <section>
        <SectionHeader
          title={t("home.nowPlayingMovies")}
          subtitle={t("home.nowPlayingMoviesSubtitle")}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.nowPlayingMovies ?? []} />
      </section>

      {/* Upcoming Movies */}
      <section>
        <SectionHeader
          title={t("home.upcomingMovies")}
          subtitle={t("home.upcomingMoviesSubtitle")}
          index={++sectionIndex}
        />
        <MediaGrid items={homeQuery.data?.upcomingMovies ?? []} />
      </section>

      {/* Browse by Genre */}
      <section>
        <SectionHeader
          title={t("home.browseByGenre")}
          subtitle={t("home.browseByGenreSubtitle")}
          index={++sectionIndex}
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {mergedGenres.map((genre) => (
            <Link
              key={genre.label}
              to="/search"
              search={{
                q: genre.label,
                scope: "all",
                genreMovie: genre.movieId ? String(genre.movieId) : undefined,
                genreSeries: genre.seriesId ? String(genre.seriesId) : undefined,
              }}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 px-2 py-4 text-center transition-all duration-200 hover:border-primary/40 hover:bg-primary/8 hover:shadow-glow active:scale-[0.97]"
            >
              <span className="text-2xl leading-none">{genre.icon}</span>
              <span className="text-[11px] font-medium leading-tight text-muted-foreground transition-colors group-hover:text-primary">
                {genre.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Browse by Platform */}
      <section>
        <SectionHeader
          title={t("home.browseByPlatform")}
          subtitle={t("home.browseByPlatformSubtitle")}
          index={++sectionIndex}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {PLATFORMS.map((platform) => (
            <Link
              key={platform.id}
              to="/search"
              search={{ q: platform.label, scope: "all", provider: String(platform.id) }}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-glow active:scale-[0.98]"
              style={{ borderColor: `${platform.color}33` }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                style={{ backgroundColor: platform.color }}
              >
                {platform.initial}
              </div>
              <span className="text-sm font-medium">{platform.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
