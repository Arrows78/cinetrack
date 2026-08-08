import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton, HeroSkeleton } from "@/components/states/loading-skeletons";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { StatCard } from "@/components/media/stat-card";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { hasTmdbToken } from "@/shared/config/env";
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import { useHistory } from "@/features/history/use-history";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { useWatchNext } from "@/features/progress/use-watch-next";
import { useWatchlist } from "@/features/watchlist/use-watchlist";
import { useHomeFeed } from "@/features/media/use-media";
import { WatchNextSection } from "@/components/media/watch-next-section";
import type { HomeFeed } from "@/types/media";

const CATALOGUE_SECTIONS = [
  { key: "trendingSeries", titleKey: "home.trendingSeries", subtitleKey: "home.trendingSeriesSubtitle" },
  { key: "topRatedSeries", titleKey: "home.topRatedSeries", subtitleKey: "home.topRatedSeriesSubtitle" },
  { key: "onTheAirSeries", titleKey: "home.onTheAirSeries", subtitleKey: "home.onTheAirSeriesSubtitle" },
  { key: "trendingMovies", titleKey: "home.trendingMovies", subtitleKey: "home.trendingMoviesSubtitle" },
  { key: "topRatedMovies", titleKey: "home.topRatedMovies", subtitleKey: "home.topRatedMoviesSubtitle" },
  { key: "nowPlayingMovies", titleKey: "home.nowPlayingMovies", subtitleKey: "home.nowPlayingMoviesSubtitle" },
  { key: "upcomingMovies", titleKey: "home.upcomingMovies", subtitleKey: "home.upcomingMoviesSubtitle" },
] as const satisfies ReadonlyArray<{ key: keyof HomeFeed; titleKey: string; subtitleKey: string }>;

const SERIES_GENRE_ALIASES: Record<string, string> = {
  Action: "Action & Adventure",
  Adventure: "Action & Adventure",
  Fantasy: "Sci-Fi & Fantasy",
  "Science Fiction": "Sci-Fi & Fantasy",
  War: "War & Politics",
};

interface MergedGenre {
  id: number;
  label: string;
  labelKey: string;
  icon: string;
  movieId: number;
  seriesId: number;
}

// `label` stays the stable English TMDB name used for matching/dedup/sort
// below; `labelKey` is what's actually rendered (see the Link's {t(...)}).
const useMergedGenres = () =>
  useMemo(() => {
    const seen = new Map<string, MergedGenre>();
    for (const g of GENRES.movies) {
      const seriesLabel = SERIES_GENRE_ALIASES[g.label] ?? g.label;
      const seriesMatch = GENRES.series.find((s) => s.label === seriesLabel);
      seen.set(g.label, {
        id: g.id,
        label: g.label,
        labelKey: g.labelKey,
        icon: g.icon,
        movieId: g.id,
        seriesId: seriesMatch?.id ?? 0,
      });
    }
    for (const g of GENRES.series) {
      if (!seen.has(g.label) && !Array.from(seen.values()).some((item) => item.seriesId === g.id)) {
        const movieMatch = GENRES.movies.find((m) => m.label === g.label);
        seen.set(g.label, {
          id: g.id,
          label: g.label,
          labelKey: g.labelKey,
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
  const watchNext = useWatchNext(trackedSeriesQuery.data ?? []);

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

  if (homeQuery.isError) {
    return <RemoteErrorState error={homeQuery.error} onRetry={() => void homeQuery.refetch()} />;
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
      progress: { watched: item.watchedEpisodes, total: item.totalEpisodes },
    }));

  let sectionIndex = 0;

  return (
    <div className="space-y-12">
      {/* Cinematic hero */}
      {hero ? (
        <section className="relative overflow-hidden rounded-hero border border-border animate-in-up">
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
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-overline font-semibold text-primary uppercase animate-in delay-200">
              <Sparkles className="h-3 w-3" />
              {t("home.premiumSelection")}
            </div>

            {/* Title */}
            <h2 className="mt-5 max-w-2xl font-display text-4xl font-bold leading-[1.05] text-balance text-card-foreground md:text-5xl lg:text-6xl delay-300 hero-title-reveal">
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
              <Button
                asChild
                size="lg"
                className="group gap-2 transition-all duration-base hover:shadow-glow-lg hover:scale-[1.02]"
              >
                <Link to="/movies/$movieId" params={{ movieId: String(hero.id) }}>
                  {t("home.viewDetails")}
                  <ArrowRight className="h-4 w-4 transition-transform duration-base group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="transition-all duration-base hover:bg-primary/10 hover:border-primary/40"
              >
                <Link to="/search">{t("home.exploreCatalog")}</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Watch next (TV Time-style episode queue) */}
      {watchNext.entries.length > 0 ? <WatchNextSection entries={watchNext.entries} index={++sectionIndex} /> : null}

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

      {/* Series and movies catalogue sections */}
      {CATALOGUE_SECTIONS.map((section) => (
        <section key={section.key}>
          <SectionHeader title={t(section.titleKey)} subtitle={t(section.subtitleKey)} index={++sectionIndex} />
          <MediaGrid items={homeQuery.data?.[section.key] ?? []} />
        </section>
      ))}

      {/* Browse by Genre */}
      <section>
        <SectionHeader
          title={t("home.browseByGenre")}
          subtitle={t("home.browseByGenreSubtitle")}
          index={++sectionIndex}
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {mergedGenres.map((genre) => (
            <Panel
              asChild
              tone="card"
              key={genre.label}
              className="flex flex-col items-center gap-2 px-2 py-4 text-center transition-all duration-fast hover:border-primary/40 hover:bg-primary/10 hover:shadow-glow active:scale-[0.97]"
            >
              <Link
                to="/search"
                search={{
                  q: t(genre.labelKey),
                  scope: "all",
                  genreMovie: genre.movieId ? String(genre.movieId) : undefined,
                  genreSeries: genre.seriesId ? String(genre.seriesId) : undefined,
                }}
                className="group"
              >
                <span className="text-2xl leading-none">{genre.icon}</span>
                <span className="text-caption font-medium leading-tight text-muted-foreground transition-colors group-hover:text-primary">
                  {t(genre.labelKey)}
                </span>
              </Link>
            </Panel>
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
            <Panel
              asChild
              tone="card"
              key={platform.id}
              className="p-4 transition-all duration-fast hover:scale-[1.02] hover:shadow-glow active:scale-[0.98]"
            >
              <Link
                to="/search"
                search={{ q: platform.label, scope: "all", provider: String(platform.id) }}
                className="group flex items-center gap-3"
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
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
