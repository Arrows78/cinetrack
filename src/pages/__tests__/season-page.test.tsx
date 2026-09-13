import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { SeasonPage } from "../season-page";
import type { Episode, MediaSummary, Season } from "@/types/media";

// Mutable holder so a single test can flip to a non-numeric value to hit the
// not-found guard; reset to a valid pair in beforeEach.
const paramsHolder = vi.hoisted(() => ({ seriesId: "9", seasonNumber: "1" }));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => paramsHolder,
  // Same fake as history-page.test.tsx's own mock — no RouterProvider exists
  // in this render, and the prev/next season nav renders a real <Link>.
  Link: ({ children, to, params, ...rest }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={params ? to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "") : to} {...rest}>
      {children}
    </a>
  ),
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
vi.mock("@/components/media/detail/media-details-hero", () => ({
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

vi.mock("@/components/media/tracking/add-to-library-button", () => ({
  AddToLibraryButton: ({ media }: { media: MediaSummary }) => <button>Add {media.title}</button>,
}));

vi.mock("@/components/media/tracking/seen-toggle", () => ({
  SeenToggle: ({ seen, disabled, onToggle }: { seen: boolean; disabled?: boolean; onToggle: () => void }) => (
    <button data-testid="seen-toggle" aria-pressed={seen} disabled={disabled} onClick={onToggle}>
      {seen ? "Season seen" : "Mark season seen"}
    </button>
  ),
}));

vi.mock("@/components/media/tracking/episode-card", () => ({
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
const markEpisodesSeenMock = vi.fn();

function makeProgressQuery(episodeIds: number[], overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: episodeIds.map((episodeId) => ({ episodeId })),
    isSaving: false,
    toggleEpisodeSeen: toggleEpisodeSeenMock,
    markSeasonSeen: markSeasonSeenMock,
    markEpisodesSeen: markEpisodesSeenMock,
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
    markEpisodesSeenMock.mockReset();
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

  it("shows a remote error state on a non-connection series refetch error, and retry refetches both queries", () => {
    const seriesRefetch = vi.fn();
    const seasonRefetch = vi.fn();
    seriesQueryMock.mockReturnValue(
      makeQuery(defaultSeries, {
        isError: true,
        isRefetchError: true,
        error: new Error("TMDB 401: invalid token"),
        refetch: seriesRefetch,
      })
    );
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", []), { refetch: seasonRefetch }));
    renderPage();

    expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();

    expect(seriesRefetch).toHaveBeenCalledTimes(1);
    expect(seasonRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows a remote error state on a non-connection season refetch error, and retry refetches both queries", () => {
    const seriesRefetch = vi.fn();
    const seasonRefetch = vi.fn();
    seriesQueryMock.mockReturnValue(makeQuery(defaultSeries, { refetch: seriesRefetch }));
    seasonQueryMock.mockReturnValue(
      makeQuery(makeSeason("Season One", []), {
        isError: true,
        isRefetchError: true,
        error: new Error("TMDB 401: invalid token"),
        refetch: seasonRefetch,
      })
    );
    renderPage();

    expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();

    expect(seriesRefetch).toHaveBeenCalledTimes(1);
    expect(seasonRefetch).toHaveBeenCalledTimes(1);
  });

  it("keeps showing cached content with a degraded-mode badge on a connection series refetch error", () => {
    seriesQueryMock.mockReturnValue(
      makeQuery(defaultSeries, { isError: true, isRefetchError: true, error: new Error("socket hang up") })
    );
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [])));
    renderPage();

    expect(screen.getByTestId("hero")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("offline.message"))).toBeInTheDocument();
  });

  it("keeps showing cached content with a degraded-mode badge on a connection season refetch error", () => {
    seriesQueryMock.mockReturnValue(makeQuery(defaultSeries));
    seasonQueryMock.mockReturnValue(
      makeQuery(makeSeason("Season One", []), {
        isError: true,
        isRefetchError: true,
        error: new Error("socket hang up"),
      })
    );
    renderPage();

    expect(screen.getByTestId("hero")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("offline.message"))).toBeInTheDocument();
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

  // A failed progress read falls back to an empty watched set — every
  // episode would render as unwatched. Disabling the bulk toggle (and
  // saying so) keeps that wrong read from being written back as real.
  it("disables the SeenToggle and surfaces a partial error when the progress query fails", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([], { isError: true, data: undefined }));
    renderPage();

    expect(screen.getByTestId("seen-toggle")).toBeDisabled();
    expect(screen.getByText(i18n.t("media.seenStatusUnavailable"))).toBeInTheDocument();
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

  // Marking episode3 watched while episode1/episode2 are both still unwatched
  // has real previous-unwatched siblings — this is the one path that opens
  // MarkPreviousEpisodesDialog instead of calling toggleEpisodeSeen directly.
  it("marking an episode watched with earlier unwatched siblings opens the mark-previous-episodes dialog", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([]));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "toggle-episode-3" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toggleEpisodeSeenMock).not.toHaveBeenCalled();
  });

  it("confirming 'include previous' calls markEpisodesSeen with every unwatched earlier episode plus this one", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([]));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "toggle-episode-3" }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("media.markPreviousIncludeCta", { count: 2 }) }));

    expect(markEpisodesSeenMock).toHaveBeenCalledWith({
      series: defaultSeries,
      episodes: [episode1, episode2, episode3],
      target: episode3,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirming 'only this' from the dialog calls toggleEpisodeSeen for just that episode", () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([]));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "toggle-episode-3" }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("media.markPreviousOnlyThisCta") }));

    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith({ series: defaultSeries, episode: episode3, watched: true });
    expect(markEpisodesSeenMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closing the mark-previous-episodes dialog without choosing dismisses it without calling either mutation", async () => {
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1, episode2, episode3])));
    progressQueryMock.mockReturnValue(makeProgressQuery([]));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "toggle-episode-3" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toggleEpisodeSeenMock).not.toHaveBeenCalled();
    expect(markEpisodesSeenMock).not.toHaveBeenCalled();
  });

  describe("season navigation", () => {
    function seriesWithSeasons(seasonNumbers: number[]) {
      return {
        ...defaultSeries,
        seasons: seasonNumbers.map((seasonNumber) => ({
          id: seasonNumber,
          seasonNumber,
          name: `Season ${seasonNumber}`,
          overview: "",
          episodeCount: 0,
          episodes: [],
        })),
      };
    }

    it("shows no previous-season link on the first season, and a next-season link when a later season exists", () => {
      seriesQueryMock.mockReturnValue(makeQuery(seriesWithSeasons([0, 1, 2, 3])));
      seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1]))); // seasonNumber: 1
      renderPage();

      expect(screen.queryByRole("link", { name: /previous season/i })).not.toBeInTheDocument();
      const next = screen.getByRole("link", { name: /next season: season 2/i });
      expect(next).toHaveAttribute("href", "/series/9/season/2");
    });

    it("shows a previous-season link and no next-season link on the last season", () => {
      seriesQueryMock.mockReturnValue(makeQuery(seriesWithSeasons([1, 2, 3])));
      seasonQueryMock.mockReturnValue(makeQuery({ ...makeSeason("Season Three", [episode1]), seasonNumber: 3 }));
      renderPage();

      const previous = screen.getByRole("link", { name: /previous season: season 2/i });
      expect(previous).toHaveAttribute("href", "/series/9/season/2");
      expect(screen.queryByRole("link", { name: /next season/i })).not.toBeInTheDocument();
    });

    it("excludes specials (season 0) from the previous/next sequence", () => {
      seriesQueryMock.mockReturnValue(makeQuery(seriesWithSeasons([0, 1, 2])));
      seasonQueryMock.mockReturnValue(makeQuery(makeSeason("Season One", [episode1]))); // seasonNumber: 1
      renderPage();

      expect(screen.queryByRole("link", { name: /previous season/i })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /next season: season 2/i })).toBeInTheDocument();
    });

    it("shows no season navigation links when the series has a single season", () => {
      seriesQueryMock.mockReturnValue(makeQuery(seriesWithSeasons([1])));
      renderPage();

      expect(screen.queryByRole("link", { name: /previous season/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /next season/i })).not.toBeInTheDocument();
    });
  });
});
