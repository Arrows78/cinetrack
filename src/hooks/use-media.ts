import { useQueries, useQuery } from '@tanstack/react-query'
import { mediaRepository } from '@/services/repositories/media-repository'
import { queryKeys } from '@/shared/constants/query-keys'

export function useHomeFeed() {
  return useQuery({
    queryKey: queryKeys.remote.home,
    queryFn: () => mediaRepository.getHomeFeed(),
  })
}

export function useMovies() {
  return useQuery({
    queryKey: queryKeys.remote.movies,
    queryFn: () => mediaRepository.getPopularMovies(),
  })
}

export function useSeries() {
  return useQuery({
    queryKey: queryKeys.remote.series,
    queryFn: () => mediaRepository.getPopularSeries(),
  })
}

export function useMovieDetails(movieId: number) {
  return useQuery({
    queryKey: queryKeys.remote.movieDetails(movieId),
    queryFn: () => mediaRepository.getMovieDetails(movieId),
    enabled: Number.isFinite(movieId),
  })
}

export function useSeriesDetails(seriesId: number) {
  return useQuery({
    queryKey: queryKeys.remote.seriesDetails(seriesId),
    queryFn: () => mediaRepository.getSeriesDetails(seriesId),
    enabled: Number.isFinite(seriesId),
  })
}

export function useSeasonDetails(seriesId: number, seasonNumber: number) {
  return useQuery({
    queryKey: queryKeys.remote.seasonDetails(seriesId, seasonNumber),
    queryFn: () => mediaRepository.getSeasonDetails(seriesId, seasonNumber),
    enabled: Number.isFinite(seriesId) && Number.isFinite(seasonNumber),
  })
}

export function useSeriesSeasons(seriesId: number, seasonNumbers: number[]) {
  return useQueries({
    queries: seasonNumbers.map((seasonNumber) => ({
      queryKey: queryKeys.remote.seasonDetails(seriesId, seasonNumber),
      queryFn: () => mediaRepository.getSeasonDetails(seriesId, seasonNumber),
      enabled: Number.isFinite(seriesId),
      staleTime: 1000 * 60 * 60,
    })),
  })
}
