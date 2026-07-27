import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaType, PageResult } from "@/types/media";

const nextPage = <T>(lastPage: PageResult<T>) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined);

export function useHomeFeed() {
  return useQuery({
    queryKey: queryKeys.remote.home,
    queryFn: () => mediaRepository.getHomeFeed(),
  });
}

export function useMovies() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.remote.movies,
    queryFn: ({ pageParam }) => mediaRepository.getTrendingMovies(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
  return { ...query, items: query.data?.pages.flatMap((page) => page.results) ?? [] };
}

export function useSeries() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.remote.series,
    queryFn: ({ pageParam }) => mediaRepository.getTrendingSeries(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
  return { ...query, items: query.data?.pages.flatMap((page) => page.results) ?? [] };
}

export function useWatchProviders(mediaType: MediaType, region: string) {
  return useQuery({
    queryKey: queryKeys.remote.providers(mediaType, region),
    queryFn: () => mediaRepository.getWatchProviders(mediaType, region),
    staleTime: 1000 * 60 * 60 * 24,
  });
}

export function useMovieDetails(movieId: number) {
  return useQuery({
    queryKey: queryKeys.remote.movieDetails(movieId),
    queryFn: () => mediaRepository.getMovieDetails(movieId),
    enabled: Number.isFinite(movieId),
  });
}

export function useSeriesDetails(seriesId: number) {
  return useQuery({
    queryKey: queryKeys.remote.seriesDetails(seriesId),
    queryFn: () => mediaRepository.getSeriesDetails(seriesId),
    enabled: Number.isFinite(seriesId),
  });
}

export function useSeasonDetails(seriesId: number, seasonNumber: number) {
  return useQuery({
    queryKey: queryKeys.remote.seasonDetails(seriesId, seasonNumber),
    queryFn: () => mediaRepository.getSeasonDetails(seriesId, seasonNumber),
    enabled: Number.isFinite(seriesId) && Number.isFinite(seasonNumber),
  });
}

export function useSeriesSeasons(seriesId: number, seasonNumbers: number[]) {
  return useQueries({
    queries: seasonNumbers.map((seasonNumber) => ({
      queryKey: queryKeys.remote.seasonDetails(seriesId, seasonNumber),
      queryFn: () => mediaRepository.getSeasonDetails(seriesId, seasonNumber),
      enabled: Number.isFinite(seriesId),
      staleTime: 1000 * 60 * 60,
    })),
  });
}
