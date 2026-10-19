import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { mediaRepository } from "@/features/media/media-repository";
import { queryKeys } from "@/shared/constants/query-keys";
import { MIN_SEARCH_QUERY_LENGTH } from "@/shared/constants/query";
import { nextPage, uniqueMedia } from "@/features/media/use-media";
import { filterSearchResults, type SearchOptions } from "@/features/media/filter-search-results";
import type { MediaSummary, PageResult, SearchScope } from "@/types/media";

// TMDB has no relevance score shared between its movie and series discover
// endpoints, so a real combined-relevance sort isn't possible here — this
// round-robins the two result lists instead of blocking movies before
// series, so scope "all" doesn't read as "every movie, then every series".
function interleave<T>(lists: T[][]): T[] {
  const result: T[] = [];
  const maxLength = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < maxLength; index++) {
    for (const list of lists) if (index < list.length) result.push(list[index]!);
  }
  return result;
}

const mergePages = (pages: PageResult<MediaSummary>[]): PageResult<MediaSummary> => ({
  page: pages[pages.length - 1]?.page ?? 1,
  totalPages: Math.max(0, ...pages.map((page) => page.totalPages)),
  totalResults: pages.reduce((sum, page) => sum + page.totalResults, 0),
  results: interleave(pages.map((page) => page.results)),
});

export function useSearch(query: string, scope: SearchScope, options?: SearchOptions) {
  const client = useQueryClient();
  const genreMovieOption = options?.genreMovie;
  const genreSeriesOption = options?.genreSeries;
  const providerOption = options?.provider;
  const companyOption = options?.company;
  const hasFilters = Boolean(genreMovieOption || genreSeriesOption || providerOption || companyOption);
  const hasTitle = query.trim().length >= MIN_SEARCH_QUERY_LENGTH;

  const queryKey =
    hasFilters && hasTitle
      ? [...queryKeys.remote.search(query, scope), options]
      : hasFilters
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
      if (hasTitle) {
        const page = await mediaRepository.search(query, scope, pageParam);
        return { ...page, results: await filterSearchResults(page.results, options ?? {}, client) };
      }

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
    enabled: scope !== "person" && (hasFilters || hasTitle),
  });

  return {
    ...searchQuery,
    items: uniqueMedia(searchQuery.data?.pages ?? []),
  };
}
