import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { EpisodeDetailPage } from "../episode-detail-page";
import type { Episode, MediaSummary, Season } from "@/types/media";

// Mutable holder so a single test can flip to a non-numeric value to hit the
// not-found guard; reset to a valid triple in beforeEach.
const paramsHolder = vi.hoisted(() => ({ seriesId: "9", seasonNumber: "1", episodeNumber: "2" }));
vi.mock("@tanstack/react-router", () => ({
  useParams: () => paramsHolder,
  Link: ({
    children,
    to,
    params,
    ...rest
  }: PropsWithChildren<{ to: string; params?: Record<string, string> }> & Record<string, unknown>) => (
    <a href={params ? `${to}::${JSON.stringify(params)}` : to} {...rest}>
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
const toggleEpisodeSeenMock = vi.fn();
const markEpisodesSeenMock = vi.fn();
vi.mock("@/features/progress/use-progress", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useEpisodeProgress: () => progressQueryMock(),
  };
});

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
      {seen ? "Episode seen" : "Mark episode seen"}
    </button>
  ),
}));

vi.mock("@/components/media/activity/watch-history-panel", () => ({
  WatchHistoryPanel: ({ episodeId }: { episodeId?: number }) => <div data-testid="watch-history">{episodeId}</div>,
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

function makeSeason(episodes: Episode[]): Season {
  return { id: 500, seasonNumber: 1, name: "Season One", overview: "", episodeCount: episodes.length, episodes };
}

const PAST_DATE = "2020-01-01";
const episode1: Episode = {
  id: 1,
  seasonNumber: 1,
  episodeNumber: 1,
  title: "Good News About Hell",
  overview: "The first one.",
  airDate: PAST_DATE,
  rating: 8.2,
};
const episode2: Episode = {
  id: 2,
  seasonNumber: 1,
  episodeNumber: 2,
  title: "Half Loop",
  overview: "The middle one.",
  airDate: PAST_DATE,
  runtime: 55,
};
const episode3: Episode = {
  id: 3,
  seasonNumber: 1,
  episodeNumber: 3,
  title: "In Perpetuity",
  overview: "The last one.",
  airDate: PAST_DATE,
};

function makeProgressQuery(episodeIds: number[], overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: episodeIds.map((episodeId) => ({ episodeId })),
    isSaving: false,
    toggleEpisodeSeen: toggleEpisodeSeenMock,
    markEpisodesSeen: markEpisodesSeenMock,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<EpisodeDetailPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("EpisodeDetailPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    paramsHolder.seriesId = "9";
    paramsHolder.seasonNumber = "1";
    paramsHolder.episodeNumber = "2";
    seriesQueryMock.mockReset().mockReturnValue(makeQuery(defaultSeries));
    seasonQueryMock.mockReset().mockReturnValue(makeQuery(makeSeason([episode1, episode2, episode3])));
    toggleEpisodeSeenMock.mockReset();
    markEpisodesSeenMock.mockReset();
    progressQueryMock.mockReset().mockReturnValue(makeProgressQuery([]));
  });

  it("shows the not-found empty state when a param is not numeric", () => {
    paramsHolder.episodeNumber = "not-a-number";
    renderPage();

    expect(screen.getByText(i18n.t("pages.notFound"))).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("shows the not-found empty state when no episode matches episodeNumber in the season", () => {
    paramsHolder.episodeNumber = "99";
    renderPage();

    expect(screen.getByText(i18n.t("pages.notFound"))).toBeInTheDocument();
  });

  it("shows the hero skeleton while the series or season query is pending", () => {
    seriesQueryMock.mockReturnValue(makeQuery(undefined, { isPending: true }));
    const { container } = renderPage();

    expect(container.querySelector(".animate-shimmer")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("shows a remote error state on failure, and retry refetches both queries", () => {
    const seriesRefetch = vi.fn();
    const seasonRefetch = vi.fn();
    seriesQueryMock.mockReturnValue(
      makeQuery(undefined, { isError: true, error: new Error("boom"), refetch: seriesRefetch })
    );
    seasonQueryMock.mockReturnValue(makeQuery(makeSeason([]), { refetch: seasonRefetch }));
    renderPage();

    screen.getByRole("button", { name: i18n.t("errors.retry") }).click();

    expect(seriesRefetch).toHaveBeenCalledTimes(1);
    expect(seasonRefetch).toHaveBeenCalledTimes(1);
  });

  it("renders the episode's title, episode code, overview, air date, runtime and rating", () => {
    renderPage();

    expect(screen.getByText("Half Loop")).toBeInTheDocument();
    expect(screen.getByText("The middle one.")).toBeInTheDocument();
    expect(screen.getByText(/S01E02/)).toBeInTheDocument();
  });

  it("renders the episode's watch history panel scoped to its own episodeId", () => {
    renderPage();
    expect(screen.getByTestId("watch-history")).toHaveTextContent("2");
  });

  it("links to the previous and next episode, but not past the season's boundaries", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Previous episode: Good News About Hell" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next episode: In Perpetuity" })).toBeInTheDocument();

    cleanup();
    paramsHolder.episodeNumber = "1";
    renderPage();
    expect(screen.queryByRole("link", { name: /Previous episode/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Next episode: Half Loop" })).toHaveLength(1);
  });

  it("marks the SeenToggle as seen only when this episode is in the watched set", () => {
    progressQueryMock.mockReturnValue(makeProgressQuery([2]));
    renderPage();

    expect(screen.getByTestId("seen-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("toggling SeenToggle calls toggleEpisodeSeen with this episode and its flipped watched state", () => {
    // episode1 (the only earlier episode) already watched, so marking
    // episode2 watched has no "catch up on previous episodes" gap to prompt.
    progressQueryMock.mockReturnValue(makeProgressQuery([1]));
    renderPage();

    screen.getByTestId("seen-toggle").click();

    expect(toggleEpisodeSeenMock).toHaveBeenCalledWith({
      series: defaultSeries,
      episode: episode2,
      watched: true,
      note: undefined,
    });
  });

  it("disables the SeenToggle for an episode that hasn't aired yet", () => {
    seasonQueryMock.mockReturnValue(
      makeQuery(makeSeason([episode1, { ...episode2, airDate: "2999-01-01" }, episode3]))
    );
    renderPage();

    expect(screen.getByTestId("seen-toggle")).toBeDisabled();
  });

  it("hides the add-note action once the episode is already watched", () => {
    progressQueryMock.mockReturnValue(makeProgressQuery([2]));
    renderPage();

    expect(screen.queryByRole("button", { name: i18n.t("media.addWatchNoteAction") })).not.toBeInTheDocument();
  });

  // A failed progress read falls back to an empty watched set — this
  // episode would render as unwatched. Disabling the toggle (and saying so)
  // keeps that wrong read from being written back as real.
  it("disables the SeenToggle and surfaces a partial error when the progress query fails", () => {
    progressQueryMock.mockReturnValue(makeProgressQuery([], { isError: true, data: undefined }));
    renderPage();

    expect(screen.getByTestId("seen-toggle")).toBeDisabled();
    expect(screen.getByText(i18n.t("media.seenStatusUnavailable"))).toBeInTheDocument();
  });
});
