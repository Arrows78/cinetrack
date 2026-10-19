import { queryClient } from "@/app/query-client";
import { mediaRepository } from "@/features/media/media-repository";
import { STALE_5_MIN } from "@/shared/constants/query";
import { queryKeys } from "@/shared/constants/query-keys";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import type { Movie, Series } from "@/types/media";

/**
 * How many TMDB detail lookups a batch caller runs at once. Details are
 * fetched with `append_to_response` (credits, videos, ...), so they are the
 * heaviest reads the app makes — every bulk caller shares this cap.
 */
export const DETAILS_FETCH_CONCURRENCY = 8;

interface CachedDetailsOptions {
  /** Freshness window of a cache hit; defaults to {@link STALE_5_MIN}. */
  staleTime?: number;
  /** TanStack retry override; batch callers that skip a failure pass `false`. */
  retry?: false;
}

/**
 * The one way non-component code reads a movie's TMDB details: through the
 * shared query client under the same `remote.movieDetails` key the detail
 * page's `useMovieDetails` uses, so a title already viewed is a cache hit,
 * concurrent identical reads are deduped, and the result warms the cache for
 * every other consumer.
 */
export function fetchMovieDetailsCached(movieId: number, options: CachedDetailsOptions = {}): Promise<Movie> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.remote.movieDetails(movieId),
    queryFn: () => mediaRepository.getMovieDetails(movieId),
    staleTime: options.staleTime ?? STALE_5_MIN,
    ...(options.retry === false ? { retry: false as const } : {}),
  });
}

/** Series counterpart of {@link fetchMovieDetailsCached} (`remote.seriesDetails` key). */
export function fetchSeriesDetailsCached(seriesId: number, options: CachedDetailsOptions = {}): Promise<Series> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.remote.seriesDetails(seriesId),
    queryFn: () => mediaRepository.getSeriesDetails(seriesId),
    staleTime: options.staleTime ?? STALE_5_MIN,
    ...(options.retry === false ? { retry: false as const } : {}),
  });
}

/** Details of a movie or a series, picked by `mediaType`. */
export function fetchMediaDetailsCached(
  mediaType: "movie" | "series",
  mediaId: number,
  options: CachedDetailsOptions = {}
): Promise<Movie | Series> {
  return mediaType === "movie" ? fetchMovieDetailsCached(mediaId, options) : fetchSeriesDetailsCached(mediaId, options);
}

/**
 * Runs `worker` over `items` with the shared details concurrency cap and
 * returns the results in input order; a worker that throws yields `null`
 * after `onError` has seen the failure (so a caller can log it), instead of
 * rejecting the whole batch.
 */
export async function mapDetailsWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  onError: (item: T, error: unknown) => void,
  concurrency: number = DETAILS_FETCH_CONCURRENCY
): Promise<(R | null)[]> {
  const results: (R | null)[] = items.map(() => null);
  await mapWithConcurrency(
    items.map((item, index) => ({ item, index })),
    async ({ item, index }) => {
      try {
        results[index] = await worker(item);
      } catch (error) {
        onError(item, error);
      }
    },
    concurrency
  );
  return results;
}
