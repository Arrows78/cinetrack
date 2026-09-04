import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/media/library/active-filter-chips";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { FilterBar } from "@/components/media/library/filter-bar";
import { LoadMoreButton } from "@/components/media/primitives/load-more-button";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { SavedFiltersBar } from "@/components/media/library/saved-filters-bar";
import { SearchBar } from "@/components/media/primitives/search-bar";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { CatalogueSections } from "@/components/media/discover/catalogue-sections";
import { CATALOGUE_SECTIONS } from "@/components/media/discover/catalogue-sections-data";
import { BrowseByGenre, BrowseByPlatform } from "@/components/media/discover/catalogue-browse";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSearch as useSearchHook } from "@/features/media/use-search";
import { useHomeFeed } from "@/features/media/use-media";
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import { DEBOUNCE_MS, MIN_SEARCH_QUERY_LENGTH } from "@/shared/constants/query";
import type { MediaSummary, SearchFilterState, SearchScope } from "@/types/media";

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
  const navigate = useNavigate({ from: "/search" });
  const { data: preferences } = usePreferences();
  const location = useRouterState({ select: (state) => state.location });
  const searchParams = new URLSearchParams(location.search);
  const genreMovie = searchParams.get("genreMovie") || undefined;
  const genreSeries = searchParams.get("genreSeries") || undefined;
  const provider = searchParams.get("provider") || undefined;
  const urlQuery = searchParams.get("q") || "";
  const urlScope = parseSearchScope(searchParams.get("scope"));

  // Typing/scope changes push back into the URL (below, debounced for the
  // query) so a refresh or a shared link doesn't lose the in-progress
  // search. These refs track what *we* last pushed so that round-trip
  // doesn't get misread as an external navigation and clobber newer local
  // state — external changes (browser back/forward, a genre/platform Link
  // from another page) still flow through the checks below.
  // Normalized to the same "empty means undefined" shape the sync effect
  // below writes to the URL, so the mount-time comparison doesn't see a
  // false mismatch between "" (from URLSearchParams) and undefined.
  const lastPushedQueryRef = useRef<string | undefined>(urlQuery || undefined);
  const lastPushedScopeRef = useRef<SearchScope | undefined>(urlScope ?? undefined);

  const [localQuery, setLocalQuery] = useState(urlQuery);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    if ((urlQuery || undefined) !== lastPushedQueryRef.current) setLocalQuery(urlQuery);
  }

  const [selectedScope, setSelectedScope] = useState<SearchScope | null>(urlScope);
  const [prevUrlScope, setPrevUrlScope] = useState<SearchScope | null>(urlScope);
  if (urlScope !== prevUrlScope) {
    setPrevUrlScope(urlScope);
    if ((urlScope ?? undefined) !== lastPushedScopeRef.current) setSelectedScope(urlScope);
  }

  const scope = selectedScope ?? preferences?.defaultSearchType ?? "all";
  const debouncedQuery = useDebouncedValue(localQuery, DEBOUNCE_MS);

  useEffect(() => {
    const nextQuery = debouncedQuery || undefined;
    const nextScope = selectedScope ?? undefined;
    if (nextQuery === lastPushedQueryRef.current && nextScope === lastPushedScopeRef.current) return;
    lastPushedQueryRef.current = nextQuery;
    lastPushedScopeRef.current = nextScope;
    void navigate({ search: (prev) => ({ ...prev, q: nextQuery, scope: nextScope }), replace: true });
  }, [debouncedQuery, selectedScope, navigate]);
  const searchQuery = useSearchHook(debouncedQuery, scope, {
    genreMovie,
    genreSeries,
    provider,
    region: preferences?.region,
  });

  const hasFilters = Boolean(genreMovie || genreSeries || provider);
  const showResults = hasFilters || debouncedQuery.trim().length >= MIN_SEARCH_QUERY_LENGTH;
  // No query typed yet and no filter applied: browse the same catalogue
  // sections as the home dashboard instead of an empty "start typing" state.
  // Same query key as useHomeFeed on the home page, so this is a cache hit
  // (not a new network call) whenever the user came from there.
  const homeFeedQuery = useHomeFeed();
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

  // Exactly the state a saved filter captures/restores (see
  // src/types/media.ts's SearchFilterState doc comment) — the free-text
  // query is deliberately excluded, same as a smart list's rules: a saved
  // filter is a reusable *view* ("favourite sci-fi", "on my services"), not
  // a stored search term.
  const currentFilters: SearchFilterState = { scope, genreMovie, genreSeries, provider };
  const applySavedFilters = (filters: SearchFilterState) => {
    lastPushedScopeRef.current = filters.scope;
    setSelectedScope(filters.scope);
    void navigate({
      search: (prev) => ({
        ...prev,
        scope: filters.scope,
        genreMovie: filters.genreMovie,
        genreSeries: filters.genreSeries,
        provider: filters.provider,
      }),
      replace: true,
    });
  };

  const removeGenreMovie = () =>
    void navigate({ search: (prev) => ({ ...prev, genreMovie: undefined }), replace: true });
  const removeGenreSeries = () =>
    void navigate({ search: (prev) => ({ ...prev, genreSeries: undefined }), replace: true });
  const removeProvider = () => void navigate({ search: (prev) => ({ ...prev, provider: undefined }), replace: true });
  const removeScope = () => {
    lastPushedScopeRef.current = "all";
    setSelectedScope("all");
    void navigate({ search: (prev) => ({ ...prev, scope: "all" }), replace: true });
  };

  const chips: ActiveFilterChip[] = [
    ...(scope !== "all"
      ? [
          {
            key: "scope",
            label: t("filters.chips.type", { value: scope === "movie" ? t("nav.movies") : t("nav.series") }),
            onRemove: removeScope,
          },
        ]
      : []),
    ...(genreMovie
      ? [
          {
            key: "genreMovie",
            label: t("filters.chips.genre", { value: genreName(genreMovie) }),
            onRemove: removeGenreMovie,
          },
        ]
      : []),
    ...(genreSeries
      ? [
          {
            key: "genreSeries",
            label: t("filters.chips.genre", { value: genreName(genreSeries) }),
            onRemove: removeGenreSeries,
          },
        ]
      : []),
    ...(provider
      ? [
          {
            key: "provider",
            label: t("filters.chips.provider", { value: getPlatformName(provider) }),
            onRemove: removeProvider,
          },
        ]
      : []),
  ];

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
          isPageTitle
        />
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="w-full sm:w-64">
              <SearchBar value={localQuery} onChange={setLocalQuery} />
            </div>
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
          <SavedFiltersBar page="search" currentFilters={currentFilters} onApply={applySavedFilters} />
        </div>
      </div>

      <ActiveFilterChips chips={chips} />

      {!showResults ? (
        <>
          {homeFeedQuery.isLoading ? <GridSkeleton count={8} /> : null}
          {homeFeedQuery.isError ? (
            <RemoteErrorState error={homeFeedQuery.error} onRetry={() => void homeFeedQuery.refetch()} />
          ) : null}
          {!homeFeedQuery.isLoading && !homeFeedQuery.isError ? (
            <>
              <CatalogueSections feed={homeFeedQuery.data} startIndex={2} />
              <BrowseByGenre startIndex={2 + CATALOGUE_SECTIONS.length} />
              <BrowseByPlatform startIndex={3 + CATALOGUE_SECTIONS.length} />
            </>
          ) : null}
        </>
      ) : (
        <>
          {searchQuery.isLoading ? <GridSkeleton count={8} /> : null}
          {searchQuery.isError ? (
            <RemoteErrorState error={searchQuery.error} onRetry={() => void searchQuery.refetch()} />
          ) : null}
          {!searchQuery.isLoading && !searchQuery.isError && !searchQuery.items.length ? (
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
        </>
      )}
    </div>
  );
}
