import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { FilterBar } from "@/components/media/filter-bar";
import { LoadMoreButton } from "@/components/media/load-more-button";
import { MediaGrid } from "@/components/media/media-grid";
import { SearchBar } from "@/components/media/search-bar";
import { SectionHeader } from "@/components/media/section-header";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSearch as useSearchHook } from "@/features/media/use-search";
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import type { MediaSummary, SearchScope } from "@/types/media";

const ALL_GENRES = [...GENRES.movies, ...GENRES.series];
const getGenreLabelKey = (id: string | undefined) =>
  id ? ALL_GENRES.find((genre) => String(genre.id) === id)?.labelKey : undefined;
const getPlatformName = (id: string) => PLATFORMS.find((platform) => String(platform.id) === id)?.label ?? id;

const VALID_SEARCH_SCOPES: readonly SearchScope[] = ["all", "movie", "series"];
// A user can hand-edit the URL's ?scope= param — don't trust it as SearchScope
// without checking it's actually one of the values that type allows.
const parseSearchScope = (value: string | null): SearchScope | null =>
  VALID_SEARCH_SCOPES.includes(value as SearchScope) ? (value as SearchScope) : null;

export function SearchPage() {
  const { t } = useTranslation();
  const { data: preferences } = usePreferences();
  const location = useRouterState({ select: (state) => state.location });
  const searchParams = new URLSearchParams(location.search);
  const genreMovie = searchParams.get("genreMovie") || undefined;
  const genreSeries = searchParams.get("genreSeries") || undefined;
  const provider = searchParams.get("provider") || undefined;
  const urlQuery = searchParams.get("q") || "";
  const urlScope = parseSearchScope(searchParams.get("scope"));
  const [localQuery, setLocalQuery] = useState(urlQuery);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setLocalQuery(urlQuery);
  }

  const [selectedScope, setSelectedScope] = useState<SearchScope | null>(urlScope);
  const [prevUrlScope, setPrevUrlScope] = useState<SearchScope | null>(urlScope);
  if (urlScope !== prevUrlScope) {
    setPrevUrlScope(urlScope);
    setSelectedScope(urlScope);
  }

  const scope = selectedScope ?? preferences?.defaultSearchType ?? "all";
  const debouncedQuery = useDebouncedValue(localQuery, 350);
  const searchQuery = useSearchHook(debouncedQuery, scope, {
    genreMovie,
    genreSeries,
    provider,
    region: preferences?.region,
  });

  const hasFilters = Boolean(genreMovie || genreSeries || provider);
  const showResults = hasFilters || debouncedQuery.trim().length >= 2;
  const grouped = useMemo(
    () => ({
      movies: searchQuery.items.filter((item) => item.mediaType === "movie"),
      series: searchQuery.items.filter((item) => item.mediaType === "series"),
    }),
    [searchQuery.items]
  );

  const genreName = (id: string | undefined) => {
    const labelKey = getGenreLabelKey(id);
    return labelKey ? t(labelKey) : (id ?? null);
  };
  const filterTitle = hasFilters
    ? [
        genreMovie ? genreName(genreMovie) : null,
        genreSeries ? genreName(genreSeries) : null,
        provider ? getPlatformName(provider) : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : debouncedQuery;

  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <SectionHeader
          title={t("search.globalSearch")}
          subtitle={hasFilters ? t("search.showingResults", { filters: filterTitle }) : t("search.subtitle")}
          index={1}
        />
        <div className="space-y-3">
          <SearchBar value={localQuery} onChange={setLocalQuery} />
          <FilterBar
            value={scope}
            onChange={(value) => setSelectedScope(value as SearchScope)}
            options={[
              { value: "all", label: t("settings.all") },
              { value: "series", label: t("nav.series") },
              { value: "movie", label: t("nav.movies") },
            ]}
          />
        </div>
      </div>

      {searchQuery.isLoading ? <GridSkeleton count={8} /> : null}
      {searchQuery.isError ? (
        <RemoteErrorState error={searchQuery.error} onRetry={() => void searchQuery.refetch()} />
      ) : null}
      {!searchQuery.isError && !showResults && !hasFilters ? (
        <EmptyState icon={Search} title={t("search.startTyping")} description={t("search.startTypingDesc")} />
      ) : null}
      {showResults && !searchQuery.isLoading && !searchQuery.isError && !searchQuery.items.length ? (
        <EmptyState icon={SearchX} title={t("pages.noResults")} description={t("search.noResultsDesc")} />
      ) : null}

      {scope === "all" && grouped.series.length > 0 ? (
        <section>
          <SectionHeader
            title={t("nav.series")}
            subtitle={t("search.resultsCount", { count: grouped.series.length })}
            index={2}
          />
          <MediaGrid items={grouped.series as MediaSummary[]} />
        </section>
      ) : null}
      {scope === "all" && grouped.movies.length > 0 ? (
        <section>
          <SectionHeader
            title={t("nav.movies")}
            subtitle={t("search.resultsCount", { count: grouped.movies.length })}
            index={grouped.series.length > 0 ? 3 : 2}
          />
          <MediaGrid items={grouped.movies as MediaSummary[]} />
        </section>
      ) : null}
      {scope !== "all" && searchQuery.items.length ? <MediaGrid items={searchQuery.items} /> : null}

      <LoadMoreButton
        hasNextPage={searchQuery.hasNextPage}
        isFetchingNextPage={searchQuery.isFetchingNextPage}
        onClick={() => void searchQuery.fetchNextPage()}
      />
    </div>
  );
}
