import type { QueryClient } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_6_HOURS, STALE_24_HOURS } from "@/shared/constants/query";
import { mapWithConcurrency } from "@/shared/utils/concurrency";
import type { MediaSummary } from "@/types/media";

export interface SearchOptions {
  genreMovie?: string;
  genreSeries?: string;
  provider?: string;
  /** Production-company filter, applicable to movies only. */
  company?: string;
  region?: string;
}

/** Search supplies title relevance; discover cannot accept a title query.
 * Keep that order while checking the extra criteria, with bounded lookups
 * and the same detail/availability cache as the title pages. */
export async function filterSearchResults(
  items: MediaSummary[],
  options: SearchOptions,
  client: QueryClient
): Promise<MediaSummary[]> {
  const candidates = items.filter((item) => {
    if (options.company && item.mediaType !== "movie") return false;
    const genre = item.mediaType === "movie" ? options.genreMovie : options.genreSeries;
    if (genre) return Boolean(item.genreIds?.includes(Number(genre)));
    return !options.genreMovie && !options.genreSeries;
  });
  const matches = new Set<MediaSummary>();
  await mapWithConcurrency(
    candidates,
    async (item) => {
      if (options.company) {
        const movie = await client.fetchQuery({
          queryKey: queryKeys.remote.movieDetails(item.id),
          queryFn: () => mediaRepository.getMovieDetails(item.id),
          staleTime: STALE_24_HOURS,
          retry: false,
        });
        if (!movie.productionCompanyIds?.includes(Number(options.company))) return;
      }
      if (options.provider) {
        const availability = await client.fetchQuery({
          queryKey: queryKeys.remote.availability(item.mediaType, item.id, options.region ?? ""),
          queryFn: () => mediaRepository.getWatchAvailability(item.mediaType, item.id, options.region),
          staleTime: STALE_6_HOURS,
          retry: false,
        });
        // Match discovery's subscription filter; a rental does not mean the
        // title is included in the viewer's streaming subscription.
        if (!availability.flatrate.some((provider) => provider.id === Number(options.provider))) return;
      }
      matches.add(item);
    },
    4
  );
  return candidates.filter((item) => matches.has(item));
}
