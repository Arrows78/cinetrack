import type {
  HomeFeed,
  MediaSummary,
  MediaType,
  Movie,
  PageResult,
  SearchScope,
  Season,
  Series,
  WatchProvider,
  WatchProviderAvailability,
  MediaVideo,
  PersonSummary,
} from "@/types/media";
import type { DiscoverArgs, MediaProvider } from "./media-provider";
import { tmdbFetch } from "@/features/media/api/client";
import {
  mapMovieDto,
  mapPage,
  mapSearchResult,
  mapSeasonDetailsDto,
  mapSeriesDto,
  mapWatchProvider,
  mapVideo,
  mapPerson,
} from "@/features/media/api/mapper";
import type {
  TmdbListResponse,
  TmdbMovieDto,
  TmdbMultiSearchResultDto,
  TmdbSeasonDetailsDto,
  TmdbTvDto,
  TmdbWatchProviderListResponse,
  TmdbProviderResultsResponse,
  TmdbVideoResponse,
  TmdbPersonDto,
} from "@/features/media/api/types";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

const languageTag = (language: "en" | "fr") => (language === "fr" ? "fr-FR" : "en-US");

export class TmdbMediaProvider implements MediaProvider {
  private async context(region?: string) {
    const preferences = await preferencesRepository.getPreferences();
    return {
      language: languageTag(preferences.language),
      region: region ?? preferences.region,
    };
  }

  async getHomeFeed(): Promise<HomeFeed> {
    const [trendingSeries, topRatedSeries, onTheAirSeries, trendingMovies, topRatedMovies, nowPlayingMovies, upcomingMovies] =
      await Promise.all([
        this.getTrendingSeries(),
        this.getTopRatedSeries(),
        this.getOnTheAirSeries(),
        this.getTrendingMovies(),
        this.getTopRatedMovies(),
        this.getNowPlayingMovies(),
        this.getUpcomingMovies(),
      ]);

    return {
      trendingSeries: trendingSeries.results,
      topRatedSeries: topRatedSeries.results,
      onTheAirSeries: onTheAirSeries.results,
      trendingMovies: trendingMovies.results,
      topRatedMovies: topRatedMovies.results,
      nowPlayingMovies: nowPlayingMovies.results,
      upcomingMovies: upcomingMovies.results,
    };
  }

  async getTrendingSeries(page = 1): Promise<PageResult<Series>> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/trending/tv/week", { language, page });
    return mapPage(response, mapSeriesDto);
  }

  async getTopRatedSeries(page = 1): Promise<PageResult<Series>> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/tv/top_rated", { language, page });
    return mapPage(response, mapSeriesDto);
  }

  async getOnTheAirSeries(page = 1): Promise<PageResult<Series>> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/tv/on_the_air", { language, page });
    return mapPage(response, mapSeriesDto);
  }

  async getTrendingMovies(page = 1): Promise<PageResult<Movie>> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/trending/movie/week", { language, page });
    return mapPage(response, mapMovieDto);
  }

  async getTopRatedMovies(page = 1): Promise<PageResult<Movie>> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/movie/top_rated", { language, page });
    return mapPage(response, mapMovieDto);
  }

  async getNowPlayingMovies(page = 1): Promise<PageResult<Movie>> {
    const { language, region } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/movie/now_playing", { language, region, page });
    return mapPage(response, mapMovieDto);
  }

  async getUpcomingMovies(page = 1): Promise<PageResult<Movie>> {
    const { language, region } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/movie/upcoming", { language, region, page });
    return mapPage(response, mapMovieDto);
  }

  async discoverMovies(args: DiscoverArgs = {}): Promise<PageResult<Movie>> {
    const { language, region } = await this.context(args.region);
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/discover/movie", {
      language,
      page: args.page ?? 1,
      sort_by: "popularity.desc",
      with_genres: args.genre,
      watch_region: args.provider ? region : undefined,
      with_watch_providers: args.provider,
      with_watch_monetization_types: args.provider ? "flatrate" : undefined,
      "with_runtime.lte": args.maxRuntime,
    });
    return mapPage(response, mapMovieDto);
  }

  async discoverSeries(args: DiscoverArgs = {}): Promise<PageResult<Series>> {
    const { language, region } = await this.context(args.region);
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/discover/tv", {
      language,
      page: args.page ?? 1,
      sort_by: "popularity.desc",
      with_genres: args.genre,
      watch_region: args.provider ? region : undefined,
      with_watch_providers: args.provider,
      with_watch_monetization_types: args.provider ? "flatrate" : undefined,
    });
    return mapPage(response, mapSeriesDto);
  }

  async getWatchProviders(mediaType: MediaType, region?: string): Promise<WatchProvider[]> {
    const context = await this.context(region);
    const path = mediaType === "movie" ? "/watch/providers/movie" : "/watch/providers/tv";
    const response = await tmdbFetch<TmdbWatchProviderListResponse>(path, { language: context.language, watch_region: context.region });

    return response.results
      .filter((provider) => !provider.display_priorities || provider.display_priorities[context.region] !== undefined)
      .sort((a, b) => {
        const left = a.display_priorities?.[context.region] ?? a.display_priority;
        const right = b.display_priorities?.[context.region] ?? b.display_priority;
        return left - right;
      })
      .map(mapWatchProvider);
  }

  async getMovieDetails(movieId: number): Promise<Movie> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbMovieDto>(`/movie/${movieId}`, { language, append_to_response: "credits" });
    return mapMovieDto(response);
  }

  async getSeriesDetails(seriesId: number): Promise<Series> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbTvDto>(`/tv/${seriesId}`, { language, append_to_response: "credits" });
    return mapSeriesDto(response);
  }

  async getSeasonDetails(seriesId: number, seasonNumber: number): Promise<Season> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbSeasonDetailsDto>(`/tv/${seriesId}/season/${seasonNumber}`, { language });
    return mapSeasonDetailsDto(response);
  }

  async search(query: string, scope: SearchScope = "all", page = 1): Promise<PageResult<MediaSummary>> {
    if (!query.trim()) return { page, totalPages: 0, totalResults: 0, results: [] };
    const { language } = await this.context();

    if (scope === "movie") {
      const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/search/movie", { language, query, page });
      return mapPage(response, (result) => mapSearchResult(result, "movie"));
    }

    if (scope === "series") {
      const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/search/tv", { language, query, page });
      return mapPage(response, (result) => mapSearchResult(result, "series"));
    }

    const response = await tmdbFetch<TmdbListResponse<TmdbMultiSearchResultDto>>("/search/multi", { language, query, page });
    const results = response.results
      .filter(
        (result): result is TmdbMultiSearchResultDto & { media_type: "movie" | "tv" } =>
          result.media_type === "movie" || result.media_type === "tv"
      )
      .map((result) => mapSearchResult(result, result.media_type === "movie" ? "movie" : "series"));

    return {
      page: response.page,
      totalPages: response.total_pages,
      totalResults: response.total_results,
      results,
    };
  }

  async getWatchAvailability(mediaType: MediaType, mediaId: number, region?: string): Promise<WatchProviderAvailability> {
    const context = await this.context(region);
    const path = mediaType === "movie" ? `/movie/${mediaId}/watch/providers` : `/tv/${mediaId}/watch/providers`;
    const response = await tmdbFetch<TmdbProviderResultsResponse>(path);
    const result = response.results[context.region] ?? {};
    return { region: context.region, link: result.link, flatrate: (result.flatrate ?? []).map(mapWatchProvider), rent: (result.rent ?? []).map(mapWatchProvider), buy: (result.buy ?? []).map(mapWatchProvider), free: (result.free ?? []).map(mapWatchProvider) };
  }

  async getRecommendations(mediaType: MediaType, mediaId: number, page = 1): Promise<PageResult<MediaSummary>> {
    const { language } = await this.context();
    const path = mediaType === "movie" ? `/movie/${mediaId}/recommendations` : `/tv/${mediaId}/recommendations`;
    if (mediaType === "movie") {
      const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>(path, { language, page });
      return mapPage(response, (item) => mapSearchResult(item, "movie"));
    }
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>(path, { language, page });
    return mapPage(response, (item) => mapSearchResult(item, "series"));
  }

  async getVideos(mediaType: MediaType, mediaId: number): Promise<MediaVideo[]> {
    const { language } = await this.context();
    const path = mediaType === "movie" ? `/movie/${mediaId}/videos` : `/tv/${mediaId}/videos`;
    const response = await tmdbFetch<TmdbVideoResponse>(path, { language });
    return response.results.filter((video) => video.site === "YouTube").sort((a,b) => Number(b.official)-Number(a.official)).map(mapVideo);
  }

  async searchPeople(query: string, page = 1): Promise<PageResult<PersonSummary>> {
    if (!query.trim()) return { page, totalPages: 0, totalResults: 0, results: [] };
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbListResponse<TmdbPersonDto>>("/search/person", { language, query, page });
    return mapPage(response, mapPerson);
  }

  async getPerson(personId: number): Promise<PersonSummary> {
    const { language } = await this.context();
    const response = await tmdbFetch<TmdbPersonDto>(`/person/${personId}`, { language, append_to_response: "combined_credits" });
    return mapPerson(response);
  }

}
