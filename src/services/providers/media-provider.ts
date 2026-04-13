import type { HomeFeed, MediaSummary, Movie, Season, Series } from '@/types/media';

export interface MediaProvider {
  getHomeFeed(): Promise<HomeFeed>;
  getPopularMovies(): Promise<Movie[]>;
  getPopularSeries(): Promise<Series[]>;
  getMovieDetails(movieId: number): Promise<Movie>;
  getSeriesDetails(seriesId: number): Promise<Series>;
  getSeasonDetails(seriesId: number, seasonNumber: number): Promise<Season>;
  search(query: string, scope?: 'all' | 'movie' | 'series'): Promise<MediaSummary[]>;
}
