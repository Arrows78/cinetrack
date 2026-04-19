import { useQuery } from "@tanstack/react-query";
import { mediaRepository } from "@/services/repositories/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary } from "@/types/media";

export function useSearch(
  query: string,
  scope: "all" | "movie" | "series",
  options?: { genreMovie?: string; genreSeries?: string; provider?: string }
) {
  const hasFilters = options?.genreMovie || options?.genreSeries || options?.provider;

  const queryKey = hasFilters
    ? queryKeys.remote.discover(options.genreMovie, options.genreSeries, options.provider, scope)
    : queryKeys.remote.search(query, scope);

  const queryFn = async (): Promise<MediaSummary[]> => {
    if (hasFilters) {
      const genreMovie = options.genreMovie ? Number(options.genreMovie) : undefined;
      const genreSeries = options.genreSeries ? Number(options.genreSeries) : undefined;
      const provider = options.provider ? Number(options.provider) : undefined;

      if (scope === "movie") {
        return mediaRepository.discoverMovies({ genre: genreMovie, provider });
      }
      if (scope === "series") {
        return mediaRepository.discoverSeries({ genre: genreSeries, provider });
      }
      const [movies, series] = await Promise.all([
        mediaRepository.discoverMovies({ genre: genreMovie, provider }),
        mediaRepository.discoverSeries({ genre: genreSeries, provider }),
      ]);
      return [...movies, ...series];
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
