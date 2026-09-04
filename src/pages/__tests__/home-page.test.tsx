import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { HomePage } from "../home-page";
import type { Movie, HomeFeed } from "@/types/media";

// useTokenVault().configured is the real vault ground truth (see
// use-token-vault.ts) — mocked here the same way the rest of this suite
// mocks hooks, so each test can flip it before rendering.
let hasTmdbTokenValue = true;
vi.mock("@/features/desktop/use-token-vault", () => ({
  useTokenVault: () => ({ configured: hasTmdbTokenValue }),
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

const preferencesMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => preferencesMock(),
}));

// Shallow-mocked presentational children, same pattern as
// src/pages/__tests__/library-page.test.tsx — keeps assertions targeted at
// HomePage's own composition/index-math logic rather than these components'.
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
}));

// Shallow-mocked for the same reason as the other presentational children
// above: both pull in mediaRepository (calendar-service.ts's own import,
// for WeeklyAgendaSection) or other hook chains well beyond what this test
// is about. TodayHub's own composition/gating logic (continue watching, up
// next, availability, Watch Tonight teaser, recommendation, needs
// attention) is covered separately by today-hub.test.tsx.
vi.mock("@/components/media/tracking/weekly-agenda-section", () => ({
  WeeklyAgendaSection: () => <div data-testid="weekly-agenda-section" />,
}));

vi.mock("@/components/media/activity/on-this-day-section", () => ({
  OnThisDaySection: () => <div data-testid="on-this-day-section" />,
}));

vi.mock("@/components/media/home/today-hub", () => ({
  TodayHub: ({ index }: { index: number }) => <div data-testid="today-hub" data-index={index} />,
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
    preferencesMock.mockReset().mockReturnValue({ data: undefined, updatePreference: vi.fn(), isSaving: false });
  });

  it("renders the no-token explainer with both actions and gates every data hook's content when no token is configured", () => {
    hasTmdbTokenValue = false;
    renderPage();

    expect(screen.getByText(i18n.t("home.noTokenTitle"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.noTokenDesc"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.noTokenWorksTitle"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.noTokenUnlocksTitle"))).toBeInTheDocument();

    const addCta = screen.getByRole("link", { name: i18n.t("home.noTokenAddCta") });
    expect(addCta).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: i18n.t("home.noTokenContinueCta") })).toBeInTheDocument();

    expect(screen.queryByTestId("catalogue-sections")).not.toBeInTheDocument();
    expect(screen.queryByText("Dune Part Two")).not.toBeInTheDocument();
  });

  it("falls through to a local-data summary with quick links when 'continue without a token' is clicked", () => {
    hasTmdbTokenValue = false;
    trackedSeriesMock.mockReturnValue({ data: [{ id: "1" }, { id: "2" }] });
    libraryMock.mockReturnValue({ data: [{ mediaId: 1, status: "planned" }] });
    historyMock.mockReturnValue({ data: { pages: [[{ id: "h1" }]] } });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("home.noTokenContinueCta") }));

    expect(screen.queryByText(i18n.t("home.noTokenTitle"))).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.noTokenBannerTitle"))).toBeInTheDocument();
    const bannerCta = screen.getByRole("link", { name: i18n.t("home.noTokenAddCta") });
    expect(bannerCta).toHaveAttribute("href", "/settings");

    expect(screen.getByText(i18n.t("home.offlineSummaryTitle"))).toBeInTheDocument();
    const followedLabel = screen.getByText(i18n.t("home.followedSeries"));
    expect(followedLabel.nextElementSibling).toHaveTextContent("2");

    expect(screen.getByRole("link", { name: new RegExp(i18n.t("nav.library")) })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: new RegExp(i18n.t("nav.tracking")) })).toHaveAttribute("href", "/tracking");
    expect(screen.getByRole("link", { name: new RegExp(i18n.t("nav.stats")) })).toHaveAttribute("href", "/stats");

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
    // The page's own sr-only <h1> is unconditional (page identity, not
    // loaded content) — it's the one heading that's expected here.
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
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

  it("renders TodayHub with an index, right after On this day", () => {
    renderPage();

    expect(screen.getByTestId("today-hub")).toHaveAttribute("data-index", "1");
  });

  it("reflects the persistent hideWatchedInDiscovery preference in the Hide watched toggle above the catalogue sections", () => {
    preferencesMock.mockReturnValue({
      data: { hideWatchedInDiscovery: true },
      updatePreference: vi.fn(),
      isSaving: false,
    });
    renderPage();

    expect(screen.getByRole("button", { name: i18n.t("discovery.hideWatched") })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
