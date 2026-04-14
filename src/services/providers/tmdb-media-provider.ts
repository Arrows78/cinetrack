import type { HomeFeed, MediaSummary, Movie, Season, Series } from '@/types/media'
import type { MediaProvider } from './media-provider'
import { tmdbFetch } from '@/services/api/tmdb/client'
import {
  mapMovieDto,
  mapSeasonDetailsDto,
  mapSearchResult,
  mapSeriesDto,
} from '@/services/api/tmdb/mapper'
import type {
  TmdbListResponse,
  TmdbMovieDto,
  TmdbMultiSearchResultDto,
  TmdbSeasonDetailsDto,
  TmdbTvDto,
} from '@/services/api/tmdb/types'

export class TmdbMediaProvider implements MediaProvider {
  async getHomeFeed(): Promise<HomeFeed> {
    const [trendingMovies, popularSeries] = await Promise.all([
      this.getTrendingMovies(),
      this.getPopularSeries(),
    ])

    return {
      trendingMovies,
      popularSeries,
    }
  }

  async getTrendingMovies(): Promise<Movie[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>('/movie/popular', {
      language: 'fr-FR',
      page: 1,
    })

    return response.results.map(mapMovieDto)
  }

  async getPopularSeries(): Promise<Series[]> {
    const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>('/tv/popular', {
      language: 'fr-FR',
      page: 1,
    })

    return response.results.map(mapSeriesDto)
  }

  async getMovieDetails(movieId: number): Promise<Movie> {
    const response = await tmdbFetch<TmdbMovieDto>(`/movie/${movieId}`, {
      language: 'fr-FR',
      append_to_response: 'credits',
    })

    return mapMovieDto(response)
  }

  async getSeriesDetails(seriesId: number): Promise<Series> {
    const response = await tmdbFetch<TmdbTvDto>(`/tv/${seriesId}`, {
      language: 'fr-FR',
      append_to_response: 'credits',
    })

    return mapSeriesDto(response)
  }

  async getSeasonDetails(seriesId: number, seasonNumber: number): Promise<Season> {
    const response = await tmdbFetch<TmdbSeasonDetailsDto>(
      `/tv/${seriesId}/season/${seasonNumber}`,
      {
        language: 'fr-FR',
      }
    )

    return mapSeasonDetailsDto(response)
  }

  async search(query: string, scope: 'all' | 'movie' | 'series' = 'all'): Promise<MediaSummary[]> {
    if (!query.trim()) return []

    if (scope === 'movie') {
      const response = await tmdbFetch<TmdbListResponse<TmdbMovieDto>>('/search/movie', {
        language: 'fr-FR',
        query,
      })
      return response.results.map((result) => mapSearchResult(result, 'movie'))
    }

    if (scope === 'series') {
      const response = await tmdbFetch<TmdbListResponse<TmdbTvDto>>('/search/tv', {
        language: 'fr-FR',
        query,
      })
      return response.results.map((result) => mapSearchResult(result, 'series'))
    }

    const response = await tmdbFetch<TmdbListResponse<TmdbMultiSearchResultDto>>('/search/multi', {
      language: 'fr-FR',
      query,
    })

    return response.results
      .filter(
        (result): result is TmdbMultiSearchResultDto & { media_type: 'movie' | 'tv' } =>
          result.media_type === 'movie' || result.media_type === 'tv'
      )
      .map((result) => mapSearchResult(result, result.media_type === 'movie' ? 'movie' : 'series'))
  }
}
