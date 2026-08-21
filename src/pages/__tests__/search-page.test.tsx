import { useEffect, useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SearchPage } from "../search-page";
import { DEBOUNCE_MS } from "@/shared/constants/query";
import type { MediaSummary } from "@/types/media";

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
    (opts: { search: (prev: Record<string, string | undefined>) => Record<string, string | undefined> }) => {
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
    // Real @tanstack/react-router re-renders every `useRouterState` consumer
    // when the location store changes (e.g. after a `navigate({ replace:
    // true })`). `mockNavigate`'s implementation mutates the shared
    // `getRouterSearch`/`setRouterSearch` holder synchronously but can't
    // reach into this hook's own React state to force a re-render — so this
    // hook polls the holder on a short interval instead, which has the same
    // externally-observable effect (a subsequent render reflects the new
    // URL) without needing a pub/sub wire-up across the two closures.
    useRouterState: (opts: { select: (state: { location: { pathname: string; search: string } }) => unknown }) => {
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
      return opts.select({ location: { pathname: "/search", search: getRouterSearch() } });
    },
  };
});

const preferencesDataMock = vi.fn(() => ({ region: "FR", defaultSearchType: "all" as const }));
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: preferencesDataMock() }),
}));

const searchHookMock = vi.fn();
vi.mock("@/features/media/use-search", () => ({
  useSearch: (...args: unknown[]) => searchHookMock(...args),
}));

const homeFeedMock = vi.fn();
vi.mock("@/features/media/use-media", () => ({
  useHomeFeed: () => homeFeedMock(),
}));

// Shallow-mocked presentational children, same pattern as
// src/pages/__tests__/home-page.test.tsx / library-page.test.tsx — keeps
// assertions targeted at SearchPage's own state/URL-sync logic rather than
// these components' internals.
vi.mock("@/components/media/catalogue-sections", () => ({
  CatalogueSections: ({ startIndex }: { startIndex: number }) => (
    <div data-testid="catalogue-sections" data-start-index={startIndex} />
  ),
  CATALOGUE_SECTIONS: [{}, {}],
}));

vi.mock("@/components/media/catalogue-browse", () => ({
  BrowseByGenre: ({ startIndex }: { startIndex: number }) => (
    <div data-testid="browse-by-genre" data-start-index={startIndex} />
  ),
  BrowseByPlatform: ({ startIndex }: { startIndex: number }) => (
    <div data-testid="browse-by-platform" data-start-index={startIndex} />
  ),
}));

vi.mock("@/components/media/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="media-grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
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

    preferencesDataMock.mockReset().mockReturnValue({ region: "FR", defaultSearchType: "all" });
    searchHookMock.mockReset().mockReturnValue(defaultSearchResult());
    homeFeedMock.mockReset().mockReturnValue({
      isLoading: false,
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
    searchHookMock.mockReturnValue({ ...defaultSearchResult(), isLoading: true });
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

  it("shows the no-results empty state when the search resolves with no items", () => {
    renderPage("?q=movie");

    expect(screen.getByText(i18n.t("pages.noResults"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("search.noResultsDesc"))).toBeInTheDocument();
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

  it("changing the scope filter navigates with the new scope reflected in the URL", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("nav.movies") }));

    // The URL push happens from a useEffect (after the state update commits),
    // not synchronously inside the click handler.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(getRouterSearch()).toContain("scope=movie");
  });
});
