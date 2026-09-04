import type { HomeFeed } from "@/types/media";

export const CATALOGUE_SECTIONS = [
  { key: "trendingSeries", titleKey: "home.trendingSeries", subtitleKey: "home.trendingSeriesSubtitle" },
  { key: "topRatedSeries", titleKey: "home.topRatedSeries", subtitleKey: "home.topRatedSeriesSubtitle" },
  { key: "onTheAirSeries", titleKey: "home.onTheAirSeries", subtitleKey: "home.onTheAirSeriesSubtitle" },
  { key: "trendingMovies", titleKey: "home.trendingMovies", subtitleKey: "home.trendingMoviesSubtitle" },
  { key: "topRatedMovies", titleKey: "home.topRatedMovies", subtitleKey: "home.topRatedMoviesSubtitle" },
  { key: "nowPlayingMovies", titleKey: "home.nowPlayingMovies", subtitleKey: "home.nowPlayingMoviesSubtitle" },
  { key: "upcomingMovies", titleKey: "home.upcomingMovies", subtitleKey: "home.upcomingMoviesSubtitle" },
] as const satisfies ReadonlyArray<{ key: keyof HomeFeed; titleKey: string; subtitleKey: string }>;
