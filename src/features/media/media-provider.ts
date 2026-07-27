import type {
  HomeFeed,
  MediaSummary,
  MediaType,
  MediaVideo,
  Movie,
  PageResult,
  PersonSummary,
  SearchScope,
  Season,
  Series,
  WatchProvider,
  WatchProviderAvailability,
} from "@/types/media";
export interface DiscoverArgs {
  genre?: number;
  provider?: number;
  page?: number;
  region?: string;
  maxRuntime?: number;
}
export interface MediaProvider {
  getHomeFeed(): Promise<HomeFeed>;
  getTrendingSeries(page?: number): Promise<PageResult<Series>>;
  getTopRatedSeries(page?: number): Promise<PageResult<Series>>;
  getOnTheAirSeries(page?: number): Promise<PageResult<Series>>;
  getTrendingMovies(page?: number): Promise<PageResult<Movie>>;
  getTopRatedMovies(page?: number): Promise<PageResult<Movie>>;
  getNowPlayingMovies(page?: number): Promise<PageResult<Movie>>;
  getUpcomingMovies(page?: number): Promise<PageResult<Movie>>;
  discoverMovies(args?: DiscoverArgs): Promise<PageResult<Movie>>;
  discoverSeries(args?: DiscoverArgs): Promise<PageResult<Series>>;
  getWatchProviders(mediaType: MediaType, region?: string): Promise<WatchProvider[]>;
  getWatchAvailability(mediaType: MediaType, mediaId: number, region?: string): Promise<WatchProviderAvailability>;
  getMovieDetails(movieId: number): Promise<Movie>;
  getSeriesDetails(seriesId: number): Promise<Series>;
  getSeasonDetails(seriesId: number, seasonNumber: number): Promise<Season>;
  search(query: string, scope?: SearchScope, page?: number): Promise<PageResult<MediaSummary>>;
  getRecommendations(mediaType: MediaType, mediaId: number, page?: number): Promise<PageResult<MediaSummary>>;
  getVideos(mediaType: MediaType, mediaId: number): Promise<MediaVideo[]>;
  searchPeople(query: string, page?: number): Promise<PageResult<PersonSummary>>;
  getPerson(personId: number): Promise<PersonSummary>;
}
