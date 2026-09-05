import { useInfiniteQuery } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { MIN_SEARCH_QUERY_LENGTH } from "@/shared/constants/query";
import { nextPage } from "@/features/media/use-media";
import type { MediaSummary, PageResult, SearchScope } from "@/types/media";

interface SearchOptions {
  genreMovie?: string;
  genreSeries?: string;
  provider?: string;
  /** TMDB production-company id — movie discover only, see DiscoverArgs.company's doc comment. */
  company?: string;
  region?: string;
}

const mergePages = (pages: PageResult<MediaSummary>[]): PageResult<MediaSummary> => ({
  page: pages[pages.length - 1]?.page ?? 1,
  totalPages: Math.max(0, ...pages.map((page) => page.totalPages)),
  totalResults: pages.reduce((sum, page) => sum + page.totalResults, 0),
  results: pages.flatMap((page) => page.results),
});

export function useSearch(query: string, scope: SearchScope, options?: SearchOptions) {
  const genreMovieOption = options?.genreMovie;
  const genreSeriesOption = options?.genreSeries;
  const providerOption = options?.provider;
  const companyOption = options?.company;
  const hasFilters = Boolean(genreMovieOption || genreSeriesOption || providerOption || companyOption);

  const queryKey = hasFilters
    ? queryKeys.remote.discover(
        genreMovieOption,
        genreSeriesOption,
        providerOption,
        scope,
        options?.region,
        companyOption
      )
    : queryKeys.remote.search(query, scope);

  const searchQuery = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<PageResult<MediaSummary>> => {
      if (!hasFilters) return mediaRepository.search(query, scope, pageParam);

      const genreMovie = genreMovieOption ? Number(genreMovieOption) : undefined;
      const genreSeries = genreSeriesOption ? Number(genreSeriesOption) : undefined;
      const provider = providerOption ? Number(providerOption) : undefined;
      const company = companyOption ? Number(companyOption) : undefined;
      const common = { provider, page: pageParam, region: options?.region };

      if (scope === "movie") {
        if (genreMovie === undefined && provider === undefined && company === undefined) return mergePages([]);
        return mediaRepository.discoverMovies({ ...common, genre: genreMovie, company });
      }

      if (scope === "series") {
        if (genreSeries === undefined && provider === undefined) return mergePages([]);
        return mediaRepository.discoverSeries({ ...common, genre: genreSeries });
      }

      const requests: Array<Promise<PageResult<MediaSummary>>> = [];
      if (genreMovie !== undefined || provider !== undefined || company !== undefined) {
        requests.push(mediaRepository.discoverMovies({ ...common, genre: genreMovie, company }));
      }
      if (genreSeries !== undefined || provider !== undefined) {
        requests.push(mediaRepository.discoverSeries({ ...common, genre: genreSeries }));
      }
      return mergePages(await Promise.all(requests));
    },
    getNextPageParam: nextPage,
    enabled: hasFilters || query.trim().length >= MIN_SEARCH_QUERY_LENGTH,
  });

  return {
    ...searchQuery,
    items: searchQuery.data?.pages.flatMap((page) => page.results) ?? [],
  };
}
