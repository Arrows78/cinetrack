import { useQuery } from "@tanstack/react-query";

import { mediaRepository } from "@/services/repositories/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary } from "@/types/media";

type SearchScope = "all" | "movie" | "series";

interface SearchOptions {
  genreMovie?: string;
  genreSeries?: string;
  provider?: string;
}

export function useSearch(query: string, scope: SearchScope, options?: SearchOptions) {
  const genreMovieOption = options?.genreMovie;
  const genreSeriesOption = options?.genreSeries;
  const providerOption = options?.provider;

  const hasFilters = Boolean(genreMovieOption || genreSeriesOption || providerOption);

  const queryKey = hasFilters
    ? queryKeys.remote.discover(genreMovieOption, genreSeriesOption, providerOption, scope)
    : queryKeys.remote.search(query, scope);

  return useQuery<MediaSummary[]>({
    queryKey,

    queryFn: async () => {
      if (!hasFilters) {
        return mediaRepository.search(query, scope);
      }

      const genreMovie = genreMovieOption ? Number(genreMovieOption) : undefined;

      const genreSeries = genreSeriesOption ? Number(genreSeriesOption) : undefined;

      const provider = providerOption ? Number(providerOption) : undefined;

      const canDiscoverMovies = genreMovie !== undefined || provider !== undefined;

      const canDiscoverSeries = genreSeries !== undefined || provider !== undefined;

      if (scope === "movie") {
        if (!canDiscoverMovies) {
          return [];
        }

        return mediaRepository.discoverMovies({
          genre: genreMovie,
          provider,
        });
      }

      if (scope === "series") {
        if (!canDiscoverSeries) {
          return [];
        }

        return mediaRepository.discoverSeries({
          genre: genreSeries,
          provider,
        });
      }

      const requests: Array<Promise<MediaSummary[]>> = [];

      if (canDiscoverMovies) {
        requests.push(
          mediaRepository.discoverMovies({
            genre: genreMovie,
            provider,
          })
        );
      }

      if (canDiscoverSeries) {
        requests.push(
          mediaRepository.discoverSeries({
            genre: genreSeries,
            provider,
          })
        );
      }

      return (await Promise.all(requests)).flat();
    },

    enabled: hasFilters || query.trim().length >= 2,
  });
}
