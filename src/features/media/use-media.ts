import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_1_HOUR } from "@/shared/constants/query";
import type { PageResult } from "@/types/media";

export const nextPage = <T>(lastPage: PageResult<T>) =>
  lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;

/**
 * The pages of an infinite listing as one list, each title once. TMDB's pages
 * overlap while popularity moves between two requests, and a repeated title
 * is a duplicated card (and a duplicated grid key). A movie and a series
 * sharing a TMDB id are different titles, so the media type is part of the key.
 */
export function uniqueMedia<T extends { id: number; mediaType: string }>(pages: Array<{ results: T[] }>): T[] {
  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of pages) {
    for (const item of page.results) {
      const key = `${item.mediaType}-${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

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
  return { ...query, items: uniqueMedia(query.data?.pages ?? []) };
}

export function useSeries() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.remote.series,
    queryFn: ({ pageParam }) => mediaRepository.getTrendingSeries(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
  return { ...query, items: uniqueMedia(query.data?.pages ?? []) };
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

export function useEpisodeImages(seriesId: number, seasonNumber: number, episodeNumber: number) {
  return useQuery({
    queryKey: queryKeys.remote.episodeImages(seriesId, seasonNumber, episodeNumber),
    queryFn: () => mediaRepository.getEpisodeImages(seriesId, seasonNumber, episodeNumber),
    enabled: Number.isFinite(seriesId) && Number.isFinite(seasonNumber) && Number.isFinite(episodeNumber),
    staleTime: STALE_1_HOUR,
  });
}

export function useSeriesSeasons(seriesId: number, seasonNumbers: number[]) {
  return useQueries({
    queries: seasonNumbers.map((seasonNumber) => ({
      queryKey: queryKeys.remote.seasonDetails(seriesId, seasonNumber),
      queryFn: () => mediaRepository.getSeasonDetails(seriesId, seasonNumber),
      enabled: Number.isFinite(seriesId),
      staleTime: STALE_1_HOUR,
    })),
  });
}
