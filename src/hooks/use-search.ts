import { useQuery } from "@tanstack/react-query";
import { mediaRepository } from "@/services/repositories/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary } from "@/types/media";

export function useSearch(
  query: string,
  scope: "all" | "movie" | "series",
  options?: { genreMovie?: string; genreSeries?: string; provider?: string }
) {
  const hasFilters = Boolean(options?.genreMovie || options?.genreSeries || options?.provider);

  const queryKey = hasFilters
    ? queryKeys.remote.discover(options.genreMovie, options.genreSeries, options.provider, scope)
    : queryKeys.remote.search(query, scope);

  const queryFn = async (): Promise<MediaSummary[]> => {
    if (hasFilters) {
      const genreMovie = options.genreMovie ? Number(options.genreMovie) : undefined;
      const genreSeries = options.genreSeries ? Number(options.genreSeries) : undefined;
      const canDiscoverMovies = Boolean(genreMovie || provider);
      const canDiscoverSeries = Boolean(genreSeries || provider);

      const provider = options.provider ? Number(options.provider) : undefined;

      if (scope === "movie") {
        return canDiscoverMovies ? mediaRepository.discoverMovies({ genre: genreMovie, provider }) : [];
      }
      if (scope === "series") {
        return canDiscoverSeries ? mediaRepository.discoverSeries({ genre: genreSeries, provider }) : [];
      }

      const requests: Array<Promise<MediaSummary[]>> = [];
      if (canDiscoverMovies) requests.push(mediaRepository.discoverMovies({ genre: genreMovie, provider }));
      if (canDiscoverSeries) requests.push(mediaRepository.discoverSeries({ genre: genreSeries, provider }));

      return (await Promise.all(requests)).flat();
    }

    return mediaRepository.search(query, scope);
  };

  const enabled = Boolean(hasFilters || query.trim().length >= 2);

  return useQuery<MediaSummary[]>({
    queryKey,
    queryFn,
    enabled,
  });
}
