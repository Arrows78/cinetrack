import { useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SearchPage } from "../search-page";
import { DEBOUNCE_MS } from "@/shared/constants/query";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { MediaSummary, SearchScope } from "@/types/media";

// --- Fake router -----------------------------------------------------------
//
// The real @tanstack/react-router keeps `location.search` in a store that
// every consumer re-renders from when it changes (e.g. after a
// `navigate({ replace: true })` call). To exercise SearchPage's own
// "don't clobber what the user is typing with our own round-trip" guards
// faithfully, this fake reproduces that behavior: `mockNavigate`'s
// implementation both records the call (so tests can assert on it) *and*
// mutates a shared "current URL search string", notifying subscribers so
// any component reading `useRouterState` re-renders with the new value —
// just like a real navigation would. `setRouterSearch` lets a test seed the
// URL before the initial render (simulating deep-linking or a browser
// back/forward that changed the URL "externally").
const { getRouterSearch, setRouterSearch, mockNavigate } = vi.hoisted(() => {
  let search = "";
  const getRouterSearch = () => search;
  const setRouterSearch = (next: string) => {
    search = next;
  };
  const mockNavigate = vi.fn(
    (opts: {
      search?: (prev: Record<string, string | undefined>) => Record<string, string | undefined>;
      to?: string;
      params?: Record<string, string>;
    }) => {
      // A dropdown item selection navigates straight to a detail route
      // ({ to, params }, no search transform) — nothing for this fake
      // router's URL-search store to do; the call itself is still recorded
      // on the vi.fn() for tests to assert against.
      if (!opts.search) return;
      const prevParams = new URLSearchParams(search);
      const prevObj: Record<string, string | undefined> = {};
      prevParams.forEach((value, key) => {
        prevObj[key] = value;
      });
      const nextObj = opts.search(prevObj);
      const nextParams = new URLSearchParams();
      Object.entries(nextObj).forEach(([key, value]) => {
        if (value !== undefined && value !== "") nextParams.set(key, value);
      });
      const nextSearch = nextParams.toString();
      setRouterSearch(nextSearch ? `?${nextSearch}` : "");
    }
  );
  return { getRouterSearch, setRouterSearch, mockNavigate };
});

vi.mock("@tanstack/react-router", () => {
  return {
    useNavigate: () => mockNavigate,
    Link: ({ children, to, search }: PropsWithChildren<{ to: string; search?: Record<string, unknown> }>) => (
      <a href={search ? `${to}?${new URLSearchParams(search as Record<string, string>).toString()}` : to}>{children}</a>
    ),
    // Real @tanstack/react-router re-renders every `useSearch` consumer when
    // the location store changes (e.g. after a `navigate({ replace: true
    // })`). `mockNavigate`'s implementation mutates the shared
    // `getRouterSearch`/`setRouterSearch` holder synchronously but can't
    // reach into this hook's own React state to force a re-render — so this
    // hook polls the holder on a short interval instead, which has the same
    // externally-observable effect (a subsequent render reflects the new
    // URL) without needing a pub/sub wire-up across the two closures.
    useSearch: () => {
      const [, forceRender] = useState(0);
      useEffect(() => {
        let search = getRouterSearch();
        const interval = window.setInterval(() => {
          const current = getRouterSearch();
          if (current !== search) {
            search = current;
            forceRender((tick) => tick + 1);
          }
        }, 10);
        return () => window.clearInterval(interval);
      }, []);
      // Real searchRoute.validateSearch (a zod object schema) hands SearchPage
      // a parsed object, not a raw query string — reproduce that here so this
      // fake stays a faithful stand-in for the real hook's return shape.
      const params = new URLSearchParams(getRouterSearch());
      const result: Record<string, string> = {};
      params.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    },
  };
});

const preferencesDataMock = vi.fn((): { region: string; defaultSearchType: SearchScope | undefined } => ({
  region: "FR",
  defaultSearchType: "all",
}));
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: preferencesDataMock() }),
  // SearchPage's saved-filters bar (see saved-filters-bar.tsx) resolves the
  // active profile via this hook — fixed to "default" so it isn't this
  // suite's concern which profile is active.
  useActiveProfileId: () => DEFAULT_PROFILE_ID,
}));

// Rendered for real below (its own behavior — save/apply/delete — is covered
// by saved-filters-bar.test.tsx) but stubbed down to a fixed, empty list here
// so this suite's own URL/scope-sync assertions don't also need to account
// for a real invoke() round-trip.
const savedFiltersState = {
  data: [] as Array<{ id: string; name: string; filters: unknown }>,
  isLoading: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  isSaving: false,
};
vi.mock("@/features/saved-filters/use-saved-filters", () => ({
  useSavedFilters: () => savedFiltersState,
}));

const searchHookMock = vi.fn();
vi.mock("@/features/media/use-search", () => ({
  useSearch: (...args: unknown[]) => searchHookMock(...args),
}));

const peopleSearchMock = vi.fn();
vi.mock("@/features/media/use-discovery", () => ({
  usePeopleSearch: (...args: unknown[]) => peopleSearchMock(...args),
}));

const searchHistoryState = {
  recentSearches: [] as string[],
  addSearch: vi.fn(),
  removeSearch: vi.fn(),
  clearHistory: vi.fn(),
};
vi.mock("@/features/media/use-search-history", () => ({
  useSearchHistory: () => searchHistoryState,
}));

const homeFeedMock = vi.fn();
vi.mock("@/features/media/use-media", () => ({
  useHomeFeed: () => homeFeedMock(),
}));

// Shallow-mocked presentational children, same pattern as
// src/pages/__tests__/home-page.test.tsx / library-page.test.tsx — keeps
// assertions targeted at SearchPage's own state/URL-sync logic rather than
// these components' internals.
vi.mock("@/components/media/discover/catalogue-sections", () => ({
  CatalogueSections: ({ startIndex }: { startIndex: number }) => (
    <div data-testid="catalogue-sections" data-start-index={startIndex} />
  ),
}));
vi.mock("@/components/media/discover/catalogue-sections-data", () => ({ CATALOGUE_SECTIONS: [{}, {}] }));

vi.mock("@/components/media/discover/catalogue-browse", () => ({
  BrowseByGenre: ({ startIndex }: { startIndex: number }) => (
    <div data-testid="browse-by-genre" data-start-index={startIndex} />
  ),
  BrowseByPlatform: ({ startIndex }: { startIndex: number }) => (
    <div data-testid="browse-by-platform" data-start-index={startIndex} />
  ),
  BrowseByStudio: ({ startIndex }: { startIndex: number }) => (
    <div data-testid="browse-by-studio" data-start-index={startIndex} />
  ),
}));

vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="media-grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
  MEDIA_GRID_CLASS_NAME: "grid",
}));

vi.mock("@/components/media/primitives/person-card", () => ({
  PersonCard: ({ person }: { person: { id: number; name: string } }) => (
    <div data-testid="person-card">{person.name}</div>
  ),
}));

function buildSummary(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 1,
    mediaType: "movie",
    title: "Dune",
    overview: "",
    posterPath: null,
    backdropPath: null,
    year: 2021,
    rating: 8,
    genres: [],
    cast: [],
    ...overrides,
  };
}

function defaultSearchResult() {
  return {
    items: [] as MediaSummary[],
    isLoading: false,
    isPending: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
}

function renderPage(initialSearch = "") {
  setRouterSearch(initialSearch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchPage />
    </QueryClientProvider>
  );
}

describe("SearchPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    mockNavigate.mockClear();
    setRouterSearch("");
    savedFiltersState.data = [];

    preferencesDataMock.mockReset().mockReturnValue({ region: "FR", defaultSearchType: "all" });
    searchHookMock.mockReset().mockReturnValue(defaultSearchResult());
    peopleSearchMock.mockReset().mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    searchHistoryState.recentSearches = [];
    searchHistoryState.addSearch.mockReset();
    searchHistoryState.removeSearch.mockReset();
    searchHistoryState.clearHistory.mockReset();
    homeFeedMock.mockReset().mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });
  });

  it("browses the home feed when there is no query and no URL filter", () => {
    renderPage();

    expect(screen.getByTestId("catalogue-sections")).toBeInTheDocument();
    expect(screen.getByTestId("browse-by-genre")).toBeInTheDocument();
    expect(screen.getByTestId("browse-by-platform")).toBeInTheDocument();
    expect(screen.queryByTestId("media-grid")).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("pages.noResults"))).not.toBeInTheDocument();
  });

  it("debounces typing and eventually queries + shows the results view for a long-enough query", async () => {
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.change(input, { target: { value: "dune" } });

    // Home-feed browse state should still be showing immediately (debounce
    // hasn't fired yet).
    expect(screen.getByTestId("catalogue-sections")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(searchHookMock).toHaveBeenCalledWith("dune", "all", expect.objectContaining({ region: "FR" }));
      },
      { timeout: DEBOUNCE_MS + 1000 }
    );

    // Once the debounced query is long enough, the page switches away from
    // the browse state (results view renders instead, "no results" here
    // since the mocked hook still returns an empty item list).
    await waitFor(() => {
      expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    });
    expect(screen.getByText(i18n.t("pages.noResults"))).toBeInTheDocument();

    // The debounced value was also pushed into the URL (replace navigation).
    await waitFor(() => {
      expect(getRouterSearch()).toContain("q=dune");
    });
  });

  it("reflects an externally-changed URL (e.g. browser back/forward) into the local input", async () => {
    renderPage("?q=dune");

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") }) as HTMLInputElement;
    expect(input.value).toBe("dune");

    // Simulate a navigation that did NOT originate from this component's own
    // debounced push (e.g. the user hit the browser's back button to an
    // earlier search, or followed a link from elsewhere) — bypass
    // `mockNavigate` and mutate the URL holder directly, the same way the
    // real router store would change under an external navigation.
    setRouterSearch("?q=inception");

    await waitFor(() => {
      expect((screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") }) as HTMLInputElement).value).toBe(
        "inception"
      );
    });
  });

  it("shows a loading skeleton while the search query is loading", () => {
    searchHookMock.mockReturnValue({ ...defaultSearchResult(), isLoading: true, isPending: true });
    const { container } = renderPage("?q=movie");

    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(screen.queryByTestId("media-grid")).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("pages.noResults"))).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-shimmer").length).toBeGreaterThan(0);
  });

  it("shows RemoteErrorState on a search error, and retry calls refetch", () => {
    const refetch = vi.fn();
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      isError: true,
      error: new Error("network down"),
      refetch,
    });
    renderPage("?q=movie");

    expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the no-results empty state when the search resolves with no items, offering to switch to the people scope in place", async () => {
    renderPage("?q=movie");

    expect(screen.getByText(i18n.t("pages.noResults"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("search.noResultsDesc"))).toBeInTheDocument();

    const tryPeopleButton = screen.getByRole("button", {
      name: i18n.t("search.tryPeopleSearch", { query: "movie" }),
    });
    fireEvent.click(tryPeopleButton);

    await waitFor(() => expect(getRouterSearch()).toBe("?q=movie&scope=person"));
  });

  it("does not offer the people-search suggestion when no-results comes from filters alone (no typed query)", () => {
    renderPage("?provider=8");

    expect(screen.getByText(i18n.t("pages.noResults"))).toBeInTheDocument();
    // Loosely matches the translated "...instead" action text without
    // colliding with the scope FilterBar's own unrelated "People" button.
    expect(screen.queryByRole("button", { name: /instead/i })).not.toBeInTheDocument();
  });

  it("groups results into separate Series and Movies sections when scope is 'all'", () => {
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [
        buildSummary({ id: 1, mediaType: "movie", title: "Dune" }),
        buildSummary({ id: 2, mediaType: "series", title: "Severance" }),
      ],
    });
    renderPage("?q=movie");

    // Scoped to headings: FilterBar's own "Series"/"Movies" toggle buttons
    // share this same translated text, so a plain getByText would be
    // ambiguous.
    expect(screen.getByRole("heading", { name: i18n.t("nav.series") })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: i18n.t("nav.movies") })).toBeInTheDocument();
    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Severance")).toBeInTheDocument();
  });

  it("hides the Series section when the 'all' scope grouping has no series results", () => {
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [buildSummary({ id: 1, mediaType: "movie", title: "Dune" })],
    });
    renderPage("?q=movie");

    expect(screen.queryByRole("heading", { name: i18n.t("nav.series") })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: i18n.t("nav.movies") })).toBeInTheDocument();
  });

  it("renders one flat grid for a non-'all' scope, without the grouped section headers", () => {
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [
        buildSummary({ id: 1, mediaType: "movie", title: "Dune" }),
        buildSummary({ id: 2, mediaType: "series", title: "Severance" }),
      ],
    });
    renderPage("?q=movie&scope=movie");

    expect(screen.queryByRole("heading", { name: i18n.t("nav.series") })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: i18n.t("nav.movies") })).not.toBeInTheDocument();
    expect(screen.getByTestId("media-grid")).toBeInTheDocument();
    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Severance")).toBeInTheDocument();
  });

  it("a URL genre filter forces the results view with an empty query and shows the genre's name", () => {
    renderPage("?genreMovie=28");

    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("search.showingResults", { filters: i18n.t("genres.action") }))).toBeInTheDocument();
  });

  it("a URL provider filter forces the results view and shows the platform's name", () => {
    renderPage("?provider=8");

    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("search.showingResults", { filters: "Netflix" }))).toBeInTheDocument();
  });

  it("a URL company filter forces the results view, shows the studio's name, and is passed to useSearch", () => {
    renderPage("?company=420");

    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("search.showingResults", { filters: "Marvel Studios" }))).toBeInTheDocument();
    expect(searchHookMock).toHaveBeenCalledWith("", "all", expect.objectContaining({ company: "420" }));
  });

  it("changing the scope filter navigates with the new scope reflected in the URL", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("nav.movies") }));

    // The URL push happens from a useEffect (after the state update commits),
    // not synchronously inside the click handler.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(getRouterSearch()).toContain("scope=movie");
  });

  it("clears every active filter at once from the chips row's own clear-all action", () => {
    renderPage("?q=movie&scope=movie&genreMovie=28&provider=8");

    const clearAll = screen.getByRole("button", { name: i18n.t("filters.clearAll") });
    fireEvent.click(clearAll);

    expect(getRouterSearch()).not.toContain("genreMovie");
    expect(getRouterSearch()).not.toContain("provider");
    expect(getRouterSearch()).toContain("scope=all");
  });

  it("removes just the scope chip, resetting scope to 'all' without touching other filters", () => {
    renderPage("?scope=movie&provider=8");

    const chipLabel = i18n.t("filters.chips.type", { value: i18n.t("nav.movies") });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) }));

    expect(getRouterSearch()).toContain("scope=all");
    expect(getRouterSearch()).toContain("provider=8");
  });

  it("removes just the genreMovie chip", () => {
    renderPage("?genreMovie=28&provider=8");

    const chipLabel = i18n.t("filters.chips.genre", { value: i18n.t("genres.action") });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) }));

    expect(getRouterSearch()).not.toContain("genreMovie");
    expect(getRouterSearch()).toContain("provider=8");
  });

  it("removes just the genreSeries chip", () => {
    renderPage("?genreSeries=10759&provider=8");

    const chipLabel = i18n.t("filters.chips.genre", { value: i18n.t("genres.actionAdventure") });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) }));

    expect(getRouterSearch()).not.toContain("genreSeries");
    expect(getRouterSearch()).toContain("provider=8");
  });

  it("removes just the provider chip", () => {
    renderPage("?provider=8&genreMovie=28");

    const chipLabel = i18n.t("filters.chips.provider", { value: "Netflix" });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) }));

    expect(getRouterSearch()).not.toContain("provider");
    expect(getRouterSearch()).toContain("genreMovie=28");
  });

  it("removes just the company chip", () => {
    renderPage("?company=420&genreMovie=28");

    const chipLabel = i18n.t("filters.chips.studio", { value: "Marvel Studios" });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) }));

    expect(getRouterSearch()).not.toContain("company");
    expect(getRouterSearch()).toContain("genreMovie=28");
  });

  it("falls back to the raw id as the label when a genre id isn't in the known list", () => {
    renderPage("?genreMovie=999999");

    expect(screen.getByText(i18n.t("search.showingResults", { filters: "999999" }))).toBeInTheDocument();
  });

  it("falls back to the raw id as the label when a provider/company id isn't in the known list", () => {
    renderPage("?provider=999999&company=888888");

    expect(screen.getByText(i18n.t("search.showingResults", { filters: "999999 • 888888" }))).toBeInTheDocument();
  });

  it("applies a saved filter, replacing the current scope and genre/provider/company filters", async () => {
    savedFiltersState.data = [
      {
        id: "saved-1",
        name: "My action picks",
        filters: { scope: "movie", genreMovie: "28", genreSeries: undefined, provider: "8", company: undefined },
      },
    ];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "My action picks" }));

    await waitFor(() => {
      expect(getRouterSearch()).toContain("scope=movie");
    });
    expect(getRouterSearch()).toContain("genreMovie=28");
    expect(getRouterSearch()).toContain("provider=8");
    expect(getRouterSearch()).not.toContain("company");
  });

  it("shows RemoteErrorState for the home-feed browse view, and retry calls refetch", () => {
    const refetch = vi.fn();
    homeFeedMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: true,
      error: new Error("network down"),
      refetch,
      data: undefined,
    });
    renderPage();

    expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("fetches the next page when the Load More button is clicked", () => {
    const fetchNextPage = vi.fn();
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [buildSummary({ id: 1, mediaType: "movie", title: "Dune" })],
      hasNextPage: true,
      fetchNextPage,
    });
    renderPage("?q=movie");

    fireEvent.click(screen.getByRole("button", { name: i18n.t("media.loadMore") }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows a loading skeleton for the home-feed browse view while it is pending", () => {
    homeFeedMock.mockReturnValue({
      isLoading: true,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });
    const { container } = renderPage();

    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-shimmer").length).toBeGreaterThan(0);
  });

  it("falls back to the 'all' scope when neither the URL nor preferences pick one", () => {
    preferencesDataMock.mockReturnValue({ region: "FR", defaultSearchType: undefined });
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [
        buildSummary({ id: 1, mediaType: "movie", title: "Dune" }),
        buildSummary({ id: 2, mediaType: "series", title: "Severance" }),
      ],
    });
    renderPage("?q=movie");

    expect(screen.getByRole("heading", { name: i18n.t("nav.series") })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: i18n.t("nav.movies") })).toBeInTheDocument();
  });

  it("labels the scope chip for the series scope", () => {
    renderPage("?scope=series");

    const chipLabel = i18n.t("filters.chips.type", { value: i18n.t("nav.series") });
    expect(
      screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) })
    ).toBeInTheDocument();
  });

  it("reflects an externally-changed URL scope (e.g. browser back/forward) into local state", async () => {
    renderPage();

    setRouterSearch("?scope=movie");

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: i18n.t("filters.removeFilter", {
            filter: i18n.t("filters.chips.type", { value: i18n.t("nav.movies") }),
          }),
        })
      ).toBeInTheDocument();
    });
  });
});

describe("SearchPage — person scope", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    setRouterSearch("");
    savedFiltersState.data = [];
    preferencesDataMock.mockReset().mockReturnValue({ region: "FR", defaultSearchType: "all" });
    searchHookMock.mockReset().mockReturnValue(defaultSearchResult());
    peopleSearchMock.mockReset().mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    searchHistoryState.recentSearches = [];
    searchHistoryState.addSearch.mockReset();
    searchHistoryState.removeSearch.mockReset();
    searchHistoryState.clearHistory.mockReset();
    homeFeedMock.mockReset().mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });
  });

  it("switching the scope filter to People navigates with scope=person", async () => {
    renderPage("?q=streep");

    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.typePeople") }));

    await waitFor(() => expect(getRouterSearch()).toContain("scope=person"));
  });

  it("renders a person grid from usePeopleSearch instead of the movie/series grid", () => {
    peopleSearchMock.mockReturnValue({
      data: { results: [{ id: 31, name: "Meryl Streep" }] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage("?q=streep&scope=person");

    expect(screen.getByTestId("person-card")).toHaveTextContent("Meryl Streep");
    expect(screen.queryByTestId("media-grid")).not.toBeInTheDocument();
  });

  it("shows the no-results empty state when the person search comes back empty", () => {
    renderPage("?q=nobody&scope=person");

    expect(screen.getByText(i18n.t("pages.noResults"))).toBeInTheDocument();
  });

  it("shows a loading skeleton while the person search is pending", () => {
    peopleSearchMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage("?q=streep&scope=person");

    expect(screen.queryByText(i18n.t("pages.noResults"))).not.toBeInTheDocument();
    expect(screen.queryByTestId("person-card")).not.toBeInTheDocument();
  });

  it("shows a remote error state for the person search, and retry calls its own refetch", () => {
    const refetch = vi.fn();
    peopleSearchMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
      isError: true,
      error: new Error("network down"),
      refetch,
    });
    renderPage("?q=streep&scope=person");

    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("SearchPage — search history and suggestions dropdown", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    setRouterSearch("");
    savedFiltersState.data = [];
    preferencesDataMock.mockReset().mockReturnValue({ region: "FR", defaultSearchType: "all" });
    searchHookMock.mockReset().mockReturnValue(defaultSearchResult());
    peopleSearchMock.mockReset().mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    searchHistoryState.recentSearches = [];
    searchHistoryState.addSearch.mockReset();
    searchHistoryState.removeSearch.mockReset();
    searchHistoryState.clearHistory.mockReset();
    homeFeedMock.mockReset().mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });
  });

  it("shows recent searches when the empty field is focused", () => {
    searchHistoryState.recentSearches = ["dune", "batman"];
    renderPage();

    fireEvent.focus(screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") }));

    const listbox = screen.getByRole("listbox", { name: i18n.t("search.suggestionsLabel") });
    expect(listbox).toHaveTextContent("dune");
    expect(listbox).toHaveTextContent("batman");
  });

  it("does not show the dropdown on focus when there is no history and no query", () => {
    renderPage();

    fireEvent.focus(screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not show a dropdown for a query shorter than the minimum search length", () => {
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "d" } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes the dropdown shortly after the field is blurred", async () => {
    searchHistoryState.recentSearches = ["dune"];
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.blur(input);

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("selecting a recent search fills the field and re-promotes it", () => {
    searchHistoryState.recentSearches = ["dune", "batman"];
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    const historyButton = screen.getByRole("button", { name: "dune" });
    fireEvent.mouseDown(historyButton);
    fireEvent.click(historyButton);

    expect(input).toHaveValue("dune");
    expect(searchHistoryState.addSearch).toHaveBeenCalledWith("dune");
  });

  it("removes a single recent search without selecting it", () => {
    searchHistoryState.recentSearches = ["dune", "batman"];
    renderPage();

    fireEvent.focus(screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") }));
    const removeButton = screen.getByRole("button", { name: i18n.t("search.removeRecentSearch", { query: "dune" }) });
    fireEvent.mouseDown(removeButton);
    fireEvent.click(removeButton);

    expect(searchHistoryState.removeSearch).toHaveBeenCalledWith("dune");
    expect(searchHistoryState.addSearch).not.toHaveBeenCalled();
  });

  it("clears the whole history from the dropdown's own action", () => {
    searchHistoryState.recentSearches = ["dune", "batman"];
    renderPage();

    fireEvent.focus(screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") }));
    const clearButton = screen.getByRole("button", { name: i18n.t("search.clearHistory") });
    fireEvent.mouseDown(clearButton);
    fireEvent.click(clearButton);

    expect(searchHistoryState.clearHistory).toHaveBeenCalledTimes(1);
  });

  it("shows a handful of live matches as suggestions once there's a real query, and selecting one navigates and records history", async () => {
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [buildSummary({ id: 1, mediaType: "movie", title: "Dune" })],
    });
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dune" } });

    await screen.findByRole("option", { name: "Dune" });
    const suggestionButton = screen.getByRole("button", { name: "Dune" });
    fireEvent.mouseDown(suggestionButton);
    fireEvent.click(suggestionButton);

    expect(searchHistoryState.addSearch).toHaveBeenCalledWith("dune");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/movies/$movieId", params: { movieId: "1" } });
  });

  it("navigates a series suggestion to its detail page", async () => {
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [buildSummary({ id: 2, mediaType: "series", title: "Severance" })],
    });
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "severance" } });

    await screen.findByRole("option", { name: "Severance" });
    fireEvent.click(screen.getByRole("button", { name: "Severance" }));

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/series/$seriesId", params: { seriesId: "2" } });
  });

  it("navigates a person suggestion to its detail page when scope is person", async () => {
    peopleSearchMock.mockReturnValue({
      data: { results: [{ id: 31, name: "Meryl Streep" }] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage("?scope=person");

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "streep" } });

    await screen.findByRole("option", { name: "Meryl Streep" });
    fireEvent.click(screen.getByRole("button", { name: "Meryl Streep" }));

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/people/$personId", params: { personId: "31" } });
  });

  it("cycles the highlighted suggestion with arrow keys and selects it on Enter", async () => {
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [
        buildSummary({ id: 1, mediaType: "movie", title: "Dune" }),
        buildSummary({ id: 2, mediaType: "movie", title: "Dune Two" }),
      ],
    });
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dune" } });
    await screen.findByRole("option", { name: "Dune" });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/movies/$movieId", params: { movieId: "2" } });
  });

  it("cycles the highlighted suggestion backwards with ArrowUp", async () => {
    searchHookMock.mockReturnValue({
      ...defaultSearchResult(),
      items: [
        buildSummary({ id: 1, mediaType: "movie", title: "Dune" }),
        buildSummary({ id: 2, mediaType: "movie", title: "Dune Two" }),
      ],
    });
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dune" } });
    await screen.findByRole("option", { name: "Dune" });

    // (-1 - 1 + length) % length lands on index 0 from the initial
    // "nothing highlighted" (-1) state.
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/movies/$movieId", params: { movieId: "1" } });
  });

  it("records the typed query on Enter when nothing is highlighted", () => {
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "arrival" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(searchHistoryState.addSearch).toHaveBeenCalledWith("arrival");
  });

  it("does nothing on Enter with an empty field and no dropdown open", () => {
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(searchHistoryState.addSearch).not.toHaveBeenCalled();
  });

  it("closes the dropdown on Escape", () => {
    searchHistoryState.recentSearches = ["dune"];
    renderPage();

    const input = screen.getByRole("textbox", { name: i18n.t("searchBar.placeholder") });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
