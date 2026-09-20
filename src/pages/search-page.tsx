import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch as useRouteSearch } from "@tanstack/react-router";
import { History, Search, SearchX, X } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/media/library/active-filter-chips";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { FilterBar } from "@/components/media/library/filter-bar";
import { LoadMoreButton } from "@/components/media/primitives/load-more-button";
import { MediaGrid, MEDIA_GRID_CLASS_NAME } from "@/components/media/primitives/media-grid";
import { PersonCard } from "@/components/media/primitives/person-card";
import { SavedFiltersBar } from "@/components/media/library/saved-filters-bar";
import { SearchBar } from "@/components/media/primitives/search-bar";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { CatalogueSections } from "@/components/media/discover/catalogue-sections";
import { CATALOGUE_SECTIONS } from "@/components/media/discover/catalogue-sections-data";
import { BrowseByGenre, BrowseByPlatform, BrowseByStudio } from "@/components/media/discover/catalogue-browse";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSearch as useSearchHook } from "@/features/media/use-search";
import { useSearchHistory } from "@/features/media/use-search-history";
import { usePeopleSearch } from "@/features/media/use-discovery";
import { useHomeFeed } from "@/features/media/use-media";
import { GENRES, PLATFORMS, STUDIOS } from "@/shared/constants/discover";
import { DEBOUNCE_MS, MIN_SEARCH_QUERY_LENGTH } from "@/shared/constants/query";
import { cn } from "@/shared/lib/cn";
import type { MediaSummary, PersonSummary, SearchFilterState, SearchScope } from "@/types/media";

const ALL_GENRES = [...GENRES.movies, ...GENRES.series];
const getGenreLabelKey = (id: string | undefined) =>
  id ? ALL_GENRES.find((genre) => String(genre.id) === id)?.labelKey : undefined;
const getPlatformName = (id: string) => PLATFORMS.find((platform) => String(platform.id) === id)?.label ?? id;
const getStudioName = (id: string) => STUDIOS.find((studio) => String(studio.id) === id)?.label ?? id;
const scopeLabel = (scope: SearchScope, t: (key: string) => string) =>
  scope === "movie" ? t("nav.movies") : scope === "series" ? t("nav.series") : t("nav.people");

// The dropdown's flat item list, in the order rendered — history entries
// while the field is empty, or a handful of live matches once there's
// something to match against (never both at once, so keyboard Up/Down
// always cycles one contiguous list).
type DropdownItem =
  | { kind: "history"; term: string }
  | { kind: "media"; media: MediaSummary }
  | { kind: "person"; person: PersonSummary };

const dropdownItemKey = (item: DropdownItem) =>
  item.kind === "history"
    ? `history-${item.term}`
    : item.kind === "media"
      ? `media-${item.media.id}`
      : `person-${item.person.id}`;

const dropdownItemLabel = (item: DropdownItem) =>
  item.kind === "history" ? item.term : item.kind === "media" ? item.media.title : item.person.name;

export function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/search" });
  const { data: preferences } = usePreferences();
  // Typed against searchRoute's own validateSearch (router-config.tsx) —
  // zod already guarantees `scope` is a real SearchScope, so there's no
  // manual URLSearchParams parsing or runtime enum check to do here anymore.
  const routeSearch = useRouteSearch({ from: "/search" });
  const genreMovie = routeSearch.genreMovie;
  const genreSeries = routeSearch.genreSeries;
  const provider = routeSearch.provider;
  const company = routeSearch.company;
  const urlQuery = routeSearch.q ?? "";
  const urlScope = routeSearch.scope ?? null;

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
  const isPersonScope = scope === "person";
  const debouncedQuery = useDebouncedValue(localQuery, DEBOUNCE_MS);

  useEffect(() => {
    const nextQuery = debouncedQuery || undefined;
    const nextScope = selectedScope ?? undefined;
    if (nextQuery === lastPushedQueryRef.current && nextScope === lastPushedScopeRef.current) return;
    lastPushedQueryRef.current = nextQuery;
    lastPushedScopeRef.current = nextScope;
    void navigate({ search: (prev) => ({ ...prev, q: nextQuery, scope: nextScope }), replace: true });
  }, [debouncedQuery, selectedScope, navigate]);
  // Person scope skips this entirely (empty query disables it) — people
  // results come from usePeopleSearch below instead, a separate,
  // non-paginated shape (PersonSummary, not MediaSummary) this hook was
  // never built to merge in.
  const searchQuery = useSearchHook(isPersonScope ? "" : debouncedQuery, scope, {
    genreMovie,
    genreSeries,
    provider,
    company,
    region: preferences?.region,
  });
  const peopleQuery = usePeopleSearch(isPersonScope ? debouncedQuery : "");
  const peopleResults = peopleQuery.data?.results ?? [];

  const hasFilters = Boolean(genreMovie || genreSeries || provider || company);
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

  // Recent-searches history and the autocomplete dropdown built on top of
  // it — closed by default, opened on focus, showing either the history
  // (empty field) or a handful of already-fetched results (matching
  // field), never both at once.
  const searchHistory = useSearchHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownId = useId();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const closeDropdown = () => {
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  };
  const trimmedLocalQuery = localQuery.trim();
  const dropdownItems: DropdownItem[] =
    trimmedLocalQuery.length === 0
      ? searchHistory.recentSearches.map((term) => ({ kind: "history", term }))
      : trimmedLocalQuery.length >= MIN_SEARCH_QUERY_LENGTH
        ? (isPersonScope ? peopleResults : searchQuery.items)
            .slice(0, 5)
            .map((item) => ("mediaType" in item ? { kind: "media", media: item } : { kind: "person", person: item }))
        : [];
  const isDropdownVisible = isDropdownOpen && dropdownItems.length > 0;

  const selectDropdownItem = (item: DropdownItem) => {
    if (item.kind === "history") {
      setLocalQuery(item.term);
      searchHistory.addSearch(item.term);
      closeDropdown();
      return;
    }
    searchHistory.addSearch(trimmedLocalQuery);
    closeDropdown();
    if (item.kind === "person") {
      void navigate({ to: "/people/$personId", params: { personId: String(item.person.id) } });
    } else {
      void navigate(
        item.media.mediaType === "movie"
          ? { to: "/movies/$movieId", params: { movieId: String(item.media.id) } }
          : { to: "/series/$seriesId", params: { seriesId: String(item.media.id) } }
      );
    }
  };

  const handleQueryChange = (value: string) => {
    setLocalQuery(value);
    setIsDropdownOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && dropdownItems.length) {
      event.preventDefault();
      setIsDropdownOpen(true);
      setHighlightedIndex((current) => (current + 1) % dropdownItems.length);
    } else if (event.key === "ArrowUp" && dropdownItems.length) {
      event.preventDefault();
      setIsDropdownOpen(true);
      setHighlightedIndex((current) => (current - 1 + dropdownItems.length) % dropdownItems.length);
    } else if (event.key === "Enter") {
      const highlighted = isDropdownVisible ? dropdownItems[highlightedIndex] : undefined;
      if (highlighted) {
        event.preventDefault();
        selectDropdownItem(highlighted);
      } else if (trimmedLocalQuery) {
        searchHistory.addSearch(trimmedLocalQuery);
        closeDropdown();
      }
    } else if (event.key === "Escape") {
      closeDropdown();
    }
  };

  const genreName = (id: string | undefined) => {
    const labelKey = getGenreLabelKey(id);
    return labelKey ? t(labelKey) : (id ?? null);
  };

  // Exactly the state a saved filter captures/restores (see
  // src/types/media.ts's SearchFilterState doc comment) — the free-text
  // query is deliberately excluded, same as a smart list's rules: a saved
  // filter is a reusable *view* ("favourite sci-fi", "on my services"), not
  // a stored search term.
  const currentFilters: SearchFilterState = { scope, genreMovie, genreSeries, provider, company };
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
        company: filters.company,
      }),
      replace: true,
    });
  };

  const removeGenreMovie = () =>
    void navigate({ search: (prev) => ({ ...prev, genreMovie: undefined }), replace: true });
  const removeGenreSeries = () =>
    void navigate({ search: (prev) => ({ ...prev, genreSeries: undefined }), replace: true });
  const removeProvider = () => void navigate({ search: (prev) => ({ ...prev, provider: undefined }), replace: true });
  const removeCompany = () => void navigate({ search: (prev) => ({ ...prev, company: undefined }), replace: true });
  const removeScope = () => {
    lastPushedScopeRef.current = "all";
    setSelectedScope("all");
    void navigate({ search: (prev) => ({ ...prev, scope: "all" }), replace: true });
  };
  // The movie/series no-results empty state's own "search people instead"
  // action — switches scope right here rather than navigating to the
  // separate /people page, now that this page covers that scope itself.
  const switchToPersonScope = () => {
    lastPushedScopeRef.current = "person";
    setSelectedScope("person");
    void navigate({ search: (prev) => ({ ...prev, scope: "person" }), replace: true });
  };
  const clearAllFilters = () => {
    lastPushedScopeRef.current = "all";
    setSelectedScope("all");
    void navigate({
      search: (prev) => ({
        ...prev,
        scope: "all",
        genreMovie: undefined,
        genreSeries: undefined,
        provider: undefined,
        company: undefined,
      }),
      replace: true,
    });
  };

  const chips: ActiveFilterChip[] = [
    ...(scope !== "all"
      ? [
          {
            key: "scope",
            label: t("filters.chips.type", { value: scopeLabel(scope, t) }),
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
    ...(company
      ? [
          {
            key: "company",
            label: t("filters.chips.studio", { value: getStudioName(company) }),
            onRemove: removeCompany,
          },
        ]
      : []),
  ];

  const filterTitle = hasFilters
    ? [
        genreMovie ? genreName(genreMovie) : null,
        genreSeries ? genreName(genreSeries) : null,
        provider ? getPlatformName(provider) : null,
        company ? getStudioName(company) : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : debouncedQuery;

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <SectionHeader
          title={t("search.globalSearch")}
          subtitle={hasFilters ? t("search.showingResults", { filters: filterTitle }) : t("search.subtitle")}
          icon={Search}
          isPageTitle
        />
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="w-full sm:w-64">
              <SearchBar
                value={localQuery}
                onChange={handleQueryChange}
                onFocus={() => setIsDropdownOpen(true)}
                // Deferred so a dropdown item's onClick (mousedown-then-click)
                // still lands before the list unmounts on blur.
                onBlur={() => window.setTimeout(closeDropdown, 100)}
                onKeyDown={handleSearchKeyDown}
                inputRef={inputRef}
                dropdownOpen={isDropdownVisible}
                dropdownId={dropdownId}
              >
                {isDropdownVisible ? (
                  <ul
                    id={dropdownId}
                    role="listbox"
                    aria-label={t("search.suggestionsLabel")}
                    className="absolute z-dropdown mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-elevation-lg"
                  >
                    {trimmedLocalQuery.length === 0 ? (
                      <li className="flex items-center justify-between px-3 py-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("search.recentSearches")}
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => searchHistory.clearHistory()}
                          className="text-caption font-medium text-primary hover:underline"
                        >
                          {t("search.clearHistory")}
                        </button>
                      </li>
                    ) : null}
                    {dropdownItems.map((item, index) => (
                      <li key={dropdownItemKey(item)} role="option" aria-selected={index === highlightedIndex}>
                        {item.kind === "history" ? (
                          <div
                            className={cn(
                              "flex items-center gap-2 rounded-md px-1 py-0.5",
                              index === highlightedIndex ? "bg-accent/15" : "hover:bg-accent/10"
                            )}
                          >
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectDropdownItem(item)}
                              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-body-sm"
                            >
                              <History className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="truncate">{item.term}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={t("search.removeRecentSearch", { query: item.term })}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => searchHistory.removeSearch(item.term)}
                              className="shrink-0 rounded-full p-1.5 hover:bg-foreground/10"
                            >
                              <X className="size-3" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectDropdownItem(item)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-body-sm",
                              index === highlightedIndex ? "bg-accent/15" : "hover:bg-accent/10"
                            )}
                          >
                            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="truncate">{dropdownItemLabel(item)}</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </SearchBar>
            </div>
            <FilterBar
              value={scope}
              onChange={(value) => setSelectedScope(value as SearchScope)}
              groupLabel={t("search.filterScope")}
              options={[
                { value: "all", label: t("filters.all") },
                { value: "series", label: t("filters.typeSeries") },
                { value: "movie", label: t("filters.typeMovies") },
                { value: "person", label: t("filters.typePeople") },
              ]}
            />
          </div>
          <SavedFiltersBar page="search" currentFilters={currentFilters} onApply={applySavedFilters} />
        </div>
      </div>

      <ActiveFilterChips chips={chips} onClearAll={clearAllFilters} />

      {!showResults ? (
        <>
          {homeFeedQuery.isPending ? <GridSkeleton count={8} /> : null}
          {homeFeedQuery.isError ? (
            <RemoteErrorState error={homeFeedQuery.error} onRetry={() => void homeFeedQuery.refetch()} />
          ) : null}
          {!homeFeedQuery.isPending && !homeFeedQuery.isError ? (
            <>
              <CatalogueSections feed={homeFeedQuery.data} startIndex={2} />
              <BrowseByGenre startIndex={2 + CATALOGUE_SECTIONS.length} />
              <BrowseByPlatform startIndex={3 + CATALOGUE_SECTIONS.length} />
              <BrowseByStudio startIndex={4 + CATALOGUE_SECTIONS.length} />
            </>
          ) : null}
        </>
      ) : isPersonScope ? (
        <>
          {peopleQuery.isPending ? <GridSkeleton count={8} /> : null}
          {peopleQuery.isError ? (
            <RemoteErrorState error={peopleQuery.error} onRetry={() => void peopleQuery.refetch()} />
          ) : null}
          {!peopleQuery.isPending && !peopleQuery.isError && !peopleResults.length ? (
            <EmptyState icon={SearchX} title={t("pages.noResults")} description={t("search.noResultsDesc")} />
          ) : null}
          {!peopleQuery.isPending && !peopleQuery.isError && peopleResults.length > 0 ? (
            <section>
              <SectionHeader
                title={t("nav.people")}
                subtitle={t("search.resultsCount", { count: peopleResults.length })}
                index={2}
              />
              <div className={MEDIA_GRID_CLASS_NAME}>
                {peopleResults.map((person, index) => (
                  <PersonCard key={person.id} person={person} index={index} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          {searchQuery.isPending ? <GridSkeleton count={8} /> : null}
          {searchQuery.isError ? (
            <RemoteErrorState error={searchQuery.error} onRetry={() => void searchQuery.refetch()} />
          ) : null}
          {!searchQuery.isPending && !searchQuery.isError && !searchQuery.items.length ? (
            <EmptyState
              icon={SearchX}
              title={t("pages.noResults")}
              description={t("search.noResultsDesc")}
              action={
                debouncedQuery.trim() ? (
                  <Button type="button" variant="outline" onClick={switchToPersonScope}>
                    {t("search.tryPeopleSearch", { query: debouncedQuery })}
                  </Button>
                ) : undefined
              }
            />
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
