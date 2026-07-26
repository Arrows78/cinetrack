import type { HomeFeed, MediaSummary, Movie, Season, Series } from "@/types/media";
import type { MediaProvider } from "./media-provider";
import { tmdbFetch } from "@/services/api/tmdb/client";
import { mapMovieDto, mapSeasonDetailsDto, mapSearchResult, mapSeriesDto } from "@/services/api/tmdb/mapper";
import type {
  TmdbListResponse,
  TmdbMovieDto,
  TmdbMultiSearchResultDto,
  TmdbSeasonDetailsDto,
  TmdbTvDto,
} from "@/services/api/tmdb/types";

export class TmdbMediaProvider implements MediaProvider {
  async getHomeFeed(): Promise<HomeFeed> {
    const [
      trendingSeries,
      topRatedSeries,
      onTheAirSeries,
      trendingMovies,
      topRatedMovies,
      nowPlayingMovies,
      upcomingMovies,
    ] = await Promise.all([
      this.getTrendingSeries(),
      this.getTopRatedSeries(),
      this.getOnTheAirSeries(),
      this.getTrendingMovies(),
      this.getTopRatedMovies(),
      this.getNowPlayingMovies(),
      this.getUpcomingMovies(),
    ]);

    return {
      trendingSeries,
      topRatedSeries,
      onTheAirSeries,
      trendingMovies,
      topRatedMovies,
      nowPlayingMovies,
      upcomingMovies,
    };
  }

  // SERIES
  async getTrendingSeries(): Promise<Series[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/trending/tv/week", {
      language: "en-US",
      page: 1,
    });
    return response.results.map(mapSeriesDto);
  }

  async getTopRatedSeries(): Promise<Series[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/tv/top_rated", {
      language: "en-US",
      page: 1,
    });
    return response.results.map(mapSeriesDto);
  }

  async getOnTheAirSeries(): Promise<Series[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/tv/on_the_air", {
      language: "en-US",
      page: 1,
    });
    return response.results.map(mapSeriesDto);
  }

  // MOVIES
  async getTrendingMovies(): Promise<Movie[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/trending/movie/week", {
      language: "en-US",
      page: 1,
    });
    return response.results.map(mapMovieDto);
  }

  async getTopRatedMovies(): Promise<Movie[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/movie/top_rated", {
      language: "en-US",
      page: 1,
    });
    return response.results.map(mapMovieDto);
  }

  async getNowPlayingMovies(): Promise<Movie[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/movie/now_playing", {
      language: "en-US",
      page: 1,
    });
    return response.results.map(mapMovieDto);
  }

  async getUpcomingMovies(): Promise<Movie[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/movie/upcoming", {
      language: "en-US",
      page: 1,
    });
    return response.results.map(mapMovieDto);
  }

  async discoverMovies(args?: { genre?: number; provider?: number }): Promise<Movie[]> {
    const params: Record<string, string> = {
      language: "en-US",
      page: "1",
      sort_by: "popularity.desc",
    };
    if (args?.genre) params.with_genres = String(args.genre);
    if (args?.provider) {
      params.watch_region = "FR";
      params.with_watch_providers = String(args.provider);
      params.with_watch_monetization_types = "flatrate";
    }
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/discover/movie", params);
    return response.results.map(mapMovieDto);
  }

  async discoverSeries(args?: { genre?: number; provider?: number }): Promise<Series[]> {
    const params: Record<string, string> = {
      language: "en-US",
      page: "1",
      sort_by: "popularity.desc",
    };
    if (args?.genre) params.with_genres = String(args.genre);
    if (args?.provider) {
      params.watch_region = "FR";
      params.with_watch_providers = String(args.provider);
      params.with_watch_monetization_types = "flatrate";
    }
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/discover/tv", params);
    return response.results.map(mapSeriesDto);
  }

  // DETAILS
  async getMovieDetails(movieId: number): Promise<Movie> {
    const response = await tmdbFetch<TmdbMovieDto>(`/movie/${movieId}`, {
      language: "en-US",
      append_to_response: "credits",
    });
    return mapMovieDto(response);
  }

  async getSeriesDetails(seriesId: number): Promise<Series> {
    const response = await tmdbFetch<TmdbTvDto>(`/tv/${seriesId}`, {
      language: "en-US",
      append_to_response: "credits",
    });
    return mapSeriesDto(response);
  }

  async getSeasonDetails(seriesId: number, seasonNumber: number): Promise<Season> {
    const response = await tmdbFetch<TmdbSeasonDetailsDto>(`/tv/${seriesId}/season/${seasonNumber}`, {
      language: "en-US",
    });
    return mapSeasonDetailsDto(response);
  }

  async search(query: string, scope: "all" | "movie" | "series" = "all"): Promise<MediaSummary[]> {
    if (!query.trim()) return [];

    if (scope === "movie") {
      const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>("/search/movie", {
        language: "en-US",
        query,
      });
      return response.results.map((result) => mapSearchResult(result, "movie"));
    }

    if (scope === "series") {
      const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>("/search/tv", {
        language: "en-US",
        query,
      });
      return response.results.map((result) => mapSearchResult(result, "series"));
    }

    const response = await tmdbFetch<TmdbListResponse<TmdbMultiSearchResultDto>>("/search/multi", {
      language: "en-US",
      query,
    });

    return response.results
      .filter(
        (result): result is TmdbMultiSearchResultDto & { media_type: "movie" | "tv" } =>
          result.media_type === "movie" || result.media_type === "tv"
      )
      .map((result) => mapSearchResult(result, result.media_type === "movie" ? "movie" : "series"));
  }
}
