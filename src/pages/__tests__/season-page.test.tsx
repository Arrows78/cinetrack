import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SeasonPage } from "../season-page";
import type { Episode, MediaSummary, Season } from "@/types/media";

// Mutable holder so a single test can flip to a non-numeric value to hit the
// not-found guard; reset to a valid pair in beforeEach.
const paramsHolder = vi.hoisted(() => ({ seriesId: "9", seasonNumber: "1" }));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => paramsHolder,
}));

const seriesQueryMock = vi.fn();
const seasonQueryMock = vi.fn();
vi.mock("@/features/media/use-media", () => ({
  useSeriesDetails: () => seriesQueryMock(),
  useSeasonDetails: () => seasonQueryMock(),
}));

const progressQueryMock = vi.fn();
vi.mock("@/features/progress/use-progress", () => ({
  useEpisodeProgress: () => progressQueryMock(),
}));

// Shallow-mock the heavy child components, same pattern as library-page.test.tsx —
// this page's own logic (title fallback, allWatched computation, wiring
// toggles to mutations) doesn't need the real hero/card markup or their own
// dependency trees.
vi.mock("@/components/media/media-details-hero", () => ({
  MediaDetailsHero: ({
    media,
    actions,
    extra,
  }: {
    media: MediaSummary;
    actions: React.ReactNode;
    extra: React.ReactNode;
  }) => (
    <div data-testid="hero">
      <span>{media.title}</span>
      {actions}
      {extra}
    </div>
  ),
}));

vi.mock("@/components/media/add-to-library-button", () => ({
  AddToLibraryButton: ({ media }: { media: MediaSummary }) => <button>Add {media.title}</button>,
}));

vi.mock("@/components/media/seen-toggle", () => ({
  SeenToggle: ({ seen, disabled, onToggle }: { seen: boolean; disabled?: boolean; onToggle: () => void }) => (
    <button data-testid="seen-toggle" aria-pressed={seen} disabled={disabled} onClick={onToggle}>
      {seen ? "Season seen" : "Mark season seen"}
    </button>
  ),
}));

vi.mock("@/components/media/episode-card", () => ({
  EpisodeCard: ({ episode, onToggleSeen }: { episode: Episode; onToggleSeen: () => void }) => (
    <div data-testid={`episode-${episode.id}`} data-watched={String(Boolean(episode.watched))}>
      <span>{episode.title}</span>
      <button aria-label={`toggle-episode-${episode.id}`} onClick={() => onToggleSeen()}>
        toggle
      </button>
    </div>
  ),
}));

function makeQuery<T>(data: T, overrides: Partial<Record<string, unknown>> = {}) {
  return { data, isPending: false, isError: false, error: null, refetch: vi.fn(), ...overrides };
}

const defaultSeries: MediaSummary = {
  id: 9,
  mediaType: "series",
  title: "Severance",
  overview: "",
  genres: [],
  cast: [],
};

function makeSeason(name: string, episodes: Episode[]): Season {
  return {
    id: 500,
    seasonNumber: 1,
    name,
    overview: "",
    episodeCount: episodes.length,
    episodes,
  };
}

const episode1: Episode = { id: 1, seasonNumber: 1, episodeNumber: 1, title: "Good News About Hell", overview: "" };
const episode2: Episode = { id: 2, seasonNumber: 1, episodeNumber: 2, title: "Half Loop", overview: "" };
const episode3: Episode = { id: 3, seasonNumber: 1, episodeNumber: 3, title: "In Perpetuity", overview: "" };

const toggleEpisodeSeenMock = vi.fn();
const markSeasonSeenMock = vi.fn();

function makeProgressQuery(episodeIds: number[], overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: episodeIds.map((episodeId) => ({ episodeId })),
    isSaving: false,
    toggleEpisodeSeen: toggleEpisodeSeenMock,
    markSeasonSeen: markSeasonSeenMock,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<SeasonPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("SeasonPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    paramsHolder.seriesId = "9";
    paramsHolder.seasonNumber = "1";
    seriesQueryMock.mockReset().mockReturnValue(makeQuery(defaultSeries));
    seasonQueryMock.mockReset().mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    toggleEpisodeSeenMock.mockReset();
    markSeasonSeenMock.mockReset();
    progressQueryMock.mockReset().mockReturnValue(makeProgressQuery([]));
  });

  it("shows the not-found empty state when seriesId is not numeric", () => {
    paramsHolder.seriesId = "not-a-number";
    renderPage();

    expect(screen.getByText(i18n.t("pages.notFound"))).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("shows the not-found empty state when seasonNumber is not numeric", () => {
    paramsHolder.seasonNumber = "not-a-number";
    renderPage();

    expect(screen.getByText(i18n.t("pages.notFound"))).toBeInTheDocument();
  });

  it("shows the hero skeleton while the series query is pending", () => {
    seriesQueryMock.mockReturnValue(makeQuery(undefined, { isPending: true }));
    const { container } = renderPage();

    expect(container.querySelector(".animate-shimmer")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("shows the hero skeleton while the season query is pending", () => {
    seasonQueryMock.mockReturnValue(makeQuery(undefined, { isPending: true }));
    const { container } = renderPage();

    expect(container.querySelector(".animate-shimmer")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("shows a remote error state on a series query error, and retry refetches both queries", () => {
    const seriesRefetch = vi.fn();
    const seasonRefetch = vi.fn();
    seriesQueryMock.mockReturnValue(
      makeQuery(undefined, { isError: true, error: new Error("boom"), refetch: seriesRefetch })
    );
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", []), { refetch: seasonRefetch }));
    renderPage();

    expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();

    expect(seriesRefetch).toHaveBeenCalledTimes(1);
    expect(seasonRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows a remote error state on a season query error, and retry refetches both queries", () => {
    const seriesRefetch = vi.fn();
    const seasonRefetch = vi.fn();
    seriesQueryMock.mockReturnValue(makeQuery(defaultSeries, { refetch: seriesRefetch }));
    seasonQueryMock.mockReturnValue(
      makeQuery(undefined, { isError: true, error: new Error("boom"), refetch: seasonRefetch })
    );
    renderPage();

    expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();

    expect(seriesRefetch).toHaveBeenCalledTimes(1);
    expect(seasonRefetch).toHaveBeenCalledTimes(1);
  });

  it("renders the season title, episode count subtitle, and each episode card's watched flag", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([1, 3]));
    renderPage();

    expect(screen.getByText("Season One")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("media.episodesAvailable", { count: 3 }))).toBeInTheDocument();

    expect(screen.getByTestId("episode-1")).toHaveAttribute("data-watched", "true");
    expect(screen.getByTestId("episode-2")).toHaveAttribute("data-watched", "false");
    expect(screen.getByTestId("episode-3")).toHaveAttribute("data-watched", "true");
  });

  it("falls back to media.fallbackTitle when the season has no name", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("", [episode1])));
    renderPage();

    expect(screen.getByText(i18n.t("media.fallbackTitle", { number: 1 }))).toBeInTheDocument();
  });

  it("marks the SeenToggle as seen only when every episode in the season is watched", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([1, 2, 3]));
    renderPage();

    expect(screen.getByTestId("seen-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the SeenToggle as not seen when only some episodes are watched", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([1]));
    renderPage();

    expect(screen.getByTestId("seen-toggle")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking SeenToggle calls markSeasonSeen with the flipped allWatched state", () => {
    const season = makeSeason("Season One", [episode1, episode2, episode3]);
    seasonQueryMock.mockReturnValue(makeQuery(season));
    progressQueryMock.mockReturnValue(makeProgressQuery([1])); // partially watched -> allWatched is false
    renderPage();

    screen.getByTestId("seen-toggle").click();

    expect(markSeasonSeenMock).toHaveBeenCalledWith({ series: defaultSeries, season, watched: true });
  });

  it("clicking an EpisodeCard's toggle calls toggleEpisodeSeen with that episode and its flipped watched state", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([1])); // episode1 watched, others not
    renderPage();

    screen.getByRole("button", { name: "toggle-episode-1" }).click();
    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith({
      series: defaultSeries,
      episode: episode1,
      watched: false,
    });

    screen.getByRole("button", { name: "toggle-episode-2" }).click();
    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith({
      series: defaultSeries,
      episode: episode2,
      watched: true,
    });
  });
});
