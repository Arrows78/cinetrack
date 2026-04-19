import type { HomeFeed, MediaSummary, Movie, Season, Series } from "@/types/media";

export interface MediaProvider {
  getHomeFeed(): Promise<HomeFeed>;
  getTrendingSeries(): Promise<Series[]>;
  getTopRatedSeries(): Promise<Series[]>;
  getOnTheAirSeries(): Promise<Series[]>;
  getTrendingMovies(): Promise<Movie[]>;
  getTopRatedMovies(): Promise<Movie[]>;
  getNowPlayingMovies(): Promise<Movie[]>;
  getUpcomingMovies(): Promise<Movie[]>;
  discoverMovies(args?: { genre?: number; provider?: number }): Promise<Movie[]>;
  discoverSeries(args?: { genre?: number; provider?: number }): Promise<Series[]>;
  getMovieDetails(movieId: number): Promise<Movie>;
  getSeriesDetails(seriesId: number): Promise<Series>;
  getSeasonDetails(seriesId: number, seasonNumber: number): Promise<Season>;
  search(query: string, scope?: "all" | "movie" | "series"): Promise<MediaSummary[]>;
}
