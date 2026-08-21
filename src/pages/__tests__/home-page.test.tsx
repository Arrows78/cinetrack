import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { HomePage } from "../home-page";
import type { Movie, HomeFeed } from "@/types/media";

// hasTmdbToken is a plain boolean export, evaluated once at module load in
// the real module — a getter here lets each test flip it before rendering,
// since the mocked module's property is re-read on every HomePage render.
let hasTmdbTokenValue = true;
vi.mock("@/shared/config/env", () => ({
  get hasTmdbToken() {
    return hasTmdbTokenValue;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={params ? `${to}::${JSON.stringify(params)}` : to}>{children}</a>
  ),
}));

// These rail hooks each pull in useStats/useLibrary/useSearch/useMergedGenres
// internally — mocking the hook itself at its own module path avoids having
// to satisfy that whole chain just to test HomePage's own composition logic.
const homeFeedMock = vi.fn();
vi.mock("@/features/media/use-media", () => ({
  useHomeFeed: () => homeFeedMock(),
}));

const libraryMock = vi.fn();
vi.mock("@/features/library/use-library", () => ({
  useLibrary: () => libraryMock(),
}));

const trackedSeriesMock = vi.fn();
vi.mock("@/features/progress/use-progress", () => ({
  useTrackedSeries: () => trackedSeriesMock(),
}));

const historyMock = vi.fn();
vi.mock("@/features/history/use-history", () => ({
  useHistory: () => historyMock(),
}));

const watchNextMock = vi.fn();
vi.mock("@/features/progress/use-watch-next", () => ({
  useWatchNext: () => watchNextMock(),
}));

const becauseYouLikedMock = vi.fn();
vi.mock("@/features/media/use-because-you-liked", () => ({
  useBecauseYouLiked: () => becauseYouLikedMock(),
}));

const favouriteGenreRailMock = vi.fn();
vi.mock("@/features/media/use-favourite-genre-rail", () => ({
  useFavouriteGenreRail: () => favouriteGenreRailMock(),
}));

// Shallow-mocked presentational children, same pattern as
// src/pages/__tests__/library-page.test.tsx — keeps assertions targeted at
// HomePage's own composition/index-math logic rather than these components'.
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

vi.mock("@/components/media/watch-next-section", () => ({
  WatchNextSection: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="watch-next-section" data-entries={entries.length} />
  ),
}));

vi.mock("@/components/media/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; title: string }> }) => (
    <div data-testid="media-grid">
      {items.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
}));

function buildMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 1,
    mediaType: "movie",
    title: "Dune Part Two",
    overview: "Paul Atreides unites with the Fremen.",
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    year: 2024,
    rating: 8.4,
    genres: [],
    cast: [],
    ...overrides,
  };
}

function buildHomeFeed(overrides: Partial<HomeFeed> = {}): HomeFeed {
  return {
    trendingSeries: [],
    topRatedSeries: [],
    onTheAirSeries: [],
    trendingMovies: [buildMovie()],
    topRatedMovies: [],
    nowPlayingMovies: [],
    upcomingMovies: [],
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>
  );
}

describe("HomePage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    hasTmdbTokenValue = true;

    homeFeedMock.mockReset().mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: buildHomeFeed(),
    });
    libraryMock.mockReset().mockReturnValue({ data: [] });
    trackedSeriesMock.mockReset().mockReturnValue({ data: [] });
    historyMock.mockReset().mockReturnValue({ data: { pages: [[]] } });
    watchNextMock.mockReset().mockReturnValue({ entries: [] });
    becauseYouLikedMock.mockReset().mockReturnValue({ seedTitle: null, items: [] });
    favouriteGenreRailMock.mockReset().mockReturnValue({ genre: null, items: [] });
  });

  it("renders the configure-TMDB empty state and gates every data hook's content when no token is configured", () => {
    hasTmdbTokenValue = false;
    renderPage();

    expect(screen.getByText(i18n.t("home.configureTmdb"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.configureTmdbDesc"))).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: i18n.t("home.configureTmdbCta") });
    expect(cta).toHaveAttribute("href", "/settings");

    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(screen.queryByText("Dune Part Two")).not.toBeInTheDocument();
  });

  it("renders skeletons while the home feed is loading, without any real content", () => {
    homeFeedMock.mockReturnValue({
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });
    renderPage();

    expect(screen.queryByText("Dune Part Two")).not.toBeInTheDocument();
    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("renders RemoteErrorState on a home-feed error, and retry calls refetch", () => {
    const refetch = vi.fn();
    homeFeedMock.mockReturnValue({
      isLoading: false,
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

  it("renders the hero from the first trending movie, its link, and the three stat cards", () => {
    trackedSeriesMock.mockReturnValue({ data: [{ id: "1" }, { id: "2" }] });
    libraryMock.mockReturnValue({
      data: [
        { mediaId: 1, status: "planned" },
        { mediaId: 2, status: "watching" },
        { mediaId: 3, status: "watching" },
      ],
    });
    historyMock.mockReturnValue({ data: { pages: [[{ id: "h1" }, { id: "h2" }, { id: "h3" }]] } });

    renderPage();

    expect(screen.getByText("Dune Part Two")).toBeInTheDocument();
    expect(screen.getByText("Paul Atreides unites with the Fremen.")).toBeInTheDocument();

    const detailsLink = screen.getByRole("link", { name: new RegExp(i18n.t("home.viewDetails")) });
    expect(detailsLink).toHaveAttribute("href", '/movies/$movieId::{"movieId":"1"}');

    // Each StatCard renders its value as the label's next sibling paragraph —
    // scoping by label avoids ambiguity if two cards happened to share a value.
    const followedLabel = screen.getByText(i18n.t("home.followedSeries"));
    expect(followedLabel.nextElementSibling).toHaveTextContent("2"); // trackedSeriesQuery.data.length

    const plannedLabel = screen.getByText(i18n.t("library.statuses.planned"));
    expect(plannedLabel.nextElementSibling).toHaveTextContent("1"); // libraryQuery.data filtered to "planned"

    const historyLabel = screen.getByText(i18n.t("nav.history"));
    expect(historyLabel.nextElementSibling).toHaveTextContent("3"); // historyQuery.data.pages[0].length
  });

  it("hides the hero section entirely when there is no trending movie", () => {
    homeFeedMock.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: buildHomeFeed({ trendingMovies: [] }),
    });
    renderPage();

    expect(screen.queryByRole("link", { name: new RegExp(i18n.t("home.viewDetails")) })).not.toBeInTheDocument();
  });

  it("shows the 'For You' section when watchNext has entries, and hides it when every rail is empty", () => {
    watchNextMock.mockReturnValue({
      entries: [{ series: { seriesId: 1, title: "Severance" }, nextEpisode: { id: 1 }, remaining: 1 }],
    });
    renderPage();

    expect(screen.getByText(i18n.t("home.forYou"))).toBeInTheDocument();
    expect(screen.getByTestId("watch-next-section")).toHaveAttribute("data-entries", "1");
  });

  it("shows the 'For You' section from becauseYouLiked alone", () => {
    becauseYouLikedMock.mockReturnValue({
      seedTitle: "Arrival",
      items: [{ id: 42, mediaType: "movie", title: "Interstellar" }],
    });
    renderPage();

    expect(screen.getByText(i18n.t("home.forYou"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.becauseYouLiked", { title: "Arrival" }))).toBeInTheDocument();
    expect(screen.getByText("Interstellar")).toBeInTheDocument();
  });

  it("shows the 'For You' section from favouriteGenreRail alone", () => {
    favouriteGenreRailMock.mockReturnValue({
      genre: { label: "Drama", labelKey: "genres.drama", movieId: 18, seriesId: 18 },
      items: [{ id: 7, mediaType: "movie", title: "Manchester by the Sea" }],
    });
    renderPage();

    expect(screen.getByText(i18n.t("home.forYou"))).toBeInTheDocument();
    expect(screen.getByText("Manchester by the Sea")).toBeInTheDocument();
  });

  it("hides the 'For You' section when watchNext, becauseYouLiked and favouriteGenreRail are all empty", () => {
    renderPage();

    expect(screen.queryByText(i18n.t("home.forYou"))).not.toBeInTheDocument();
    expect(screen.queryByTestId("watch-next-section")).not.toBeInTheDocument();
  });

  it("does not render becauseYouLiked's block when it has a seed title but no items yet", () => {
    becauseYouLikedMock.mockReturnValue({ seedTitle: "Arrival", items: [] });
    renderPage();

    // No other rail has content either, so "For You" itself must stay hidden.
    expect(screen.queryByText(i18n.t("home.forYou"))).not.toBeInTheDocument();
  });
});
