import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import type { Episode, EpisodeProgress, Season, Series } from "@/types/media";
import { SeriesDetailPage } from "../series-detail-page";

// Route param holder — mutable so a single test can override it to a
// non-numeric value to exercise the not-found guard.
const params = { seriesId: "9" as string };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
  useParams: () => params,
}));

const seriesQueryMock = vi.fn();
const seasonQueriesMock = vi.fn();
vi.mock("@/features/media/use-media", () => ({
  useSeriesDetails: () => seriesQueryMock(),
  useSeriesSeasons: () => seasonQueriesMock(),
}));

const episodeProgressMock = vi.fn();
const trackedSeriesMock = vi.fn();
const refreshTrackedSeriesStatusMock = vi.fn();
vi.mock("@/features/progress/use-progress", () => ({
  useEpisodeProgress: () => episodeProgressMock(),
  useTrackedSeries: () => trackedSeriesMock(),
  useRefreshTrackedSeriesStatus: () => refreshTrackedSeriesStatusMock,
}));

// Irrelevant IPC prefetching for this page's own logic — no-op it out.
vi.mock("@/features/media/use-image-cache", () => ({
  useImageCache: () => undefined,
}));

// Shallow-mock every heavy child so the test targets SeriesDetailPage's own
// composition/wiring (progress computation, error states, effect), not the
// children's internals.
vi.mock("@/components/media/media-details-hero", () => ({
  MediaDetailsHero: ({
    media,
    actions,
    extra,
  }: {
    media: Series;
    actions?: React.ReactNode;
    extra?: React.ReactNode;
  }) => (
    <div data-testid="hero">
      <div data-testid="hero-title">{media.title}</div>
      <div data-testid="hero-actions">{actions}</div>
      <div data-testid="hero-extra">{extra}</div>
    </div>
  ),
}));

vi.mock("@/components/library/library-editor", () => ({
  LibraryEditor: () => <div data-testid="library-editor" />,
}));

vi.mock("@/components/media/provider-availability", () => ({
  ProviderAvailability: () => <div data-testid="provider-availability" />,
}));

vi.mock("@/components/media/trailer-panel", () => ({
  TrailerPanel: () => <div data-testid="trailer-panel" />,
}));

vi.mock("@/components/media/recommendations-panel", () => ({
  RecommendationsPanel: () => <div data-testid="recommendations-panel" />,
}));

vi.mock("@/components/media/cast-list", () => ({
  CastList: () => <div data-testid="cast-list" />,
}));

vi.mock("@/components/media/add-to-library-button", () => ({
  AddToLibraryButton: () => <div data-testid="add-to-library-button" />,
}));

vi.mock("@/components/media/availability-alert-button", () => ({
  AvailabilityAlertButton: () => <div data-testid="availability-alert-button" />,
}));

const seasonAccordionPropsMock = vi.fn();
vi.mock("@/components/media/season-accordion", () => ({
  SeasonAccordion: (props: { seasons: Season[]; watchedEpisodes: EpisodeProgress[] }) => {
    seasonAccordionPropsMock(props);
    return <div data-testid="season-accordion" />;
  },
}));

const nextEpisodeCardPropsMock = vi.fn();
vi.mock("@/components/media/next-episode-card", () => ({
  NextEpisodeCard: ({ episode, onWatched }: { episode: Episode | null; onWatched: (episode: Episode) => void }) => {
    nextEpisodeCardPropsMock(episode);
    return (
      <div data-testid="next-episode-card">
        {episode ? (
          <button type="button" data-testid="next-episode-watched" onClick={() => onWatched(episode)}>
            mark next episode watched
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("@/components/media/seen-toggle", () => ({
  SeenToggle: ({ seen, disabled, onToggle }: { seen: boolean; disabled?: boolean; onToggle: () => void }) => (
    <button type="button" data-testid="seen-toggle" data-seen={seen} disabled={disabled} onClick={onToggle}>
      seen-toggle
    </button>
  ),
}));

vi.mock("@/components/media/watch-history-panel", () => ({
  WatchHistoryPanel: () => <div data-testid="watch-history-panel" />,
}));

const episodes: Episode[] = [
  {
    id: 1001,
    seasonNumber: 1,
    episodeNumber: 1,
    title: "Pilot",
    overview: "The one that starts it.",
    airDate: "2024-01-01",
  },
  {
    id: 1002,
    seasonNumber: 1,
    episodeNumber: 2,
    title: "Episode 2",
    overview: "Things escalate.",
    airDate: "2024-01-08",
  },
  {
    id: 1003,
    seasonNumber: 1,
    episodeNumber: 3,
    title: "Episode 3",
    overview: "The finale (for now).",
    airDate: "2024-01-15",
  },
];

function buildSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 9,
    mediaType: "series",
    title: "Test Series",
    overview: "A show about testing.",
    genres: ["Drama"],
    cast: [],
    posterPath: null,
    backdropPath: null,
    numberOfSeasons: 1,
    numberOfEpisodes: 3,
    status: "Returning Series",
    seasons: [{ id: 100, seasonNumber: 1, name: "Season 1", overview: "", episodeCount: 3, episodes: [] }],
    ...overrides,
  };
}

function buildSeason(overrides: Partial<Season> = {}): Season {
  return { id: 100, seasonNumber: 1, name: "Season 1", overview: "", episodeCount: 3, episodes, ...overrides };
}

// Episodes 1 and 2 watched, episode 3 (aired in the past) not yet — 2/3
// watched, and episode 3 is the next one up.
const watchedProgress: EpisodeProgress[] = [
  {
    id: "p1",
    profileId: null,
    seriesId: 9,
    episodeId: 1001,
    seasonNumber: 1,
    episodeNumber: 1,
    watched: true,
    watchedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "p2",
    profileId: null,
    seriesId: 9,
    episodeId: 1002,
    seasonNumber: 1,
    episodeNumber: 2,
    watched: true,
    watchedAt: null,
    createdAt: "2024-01-08T00:00:00.000Z",
    updatedAt: "2024-01-08T00:00:00.000Z",
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<SeriesDetailPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("SeriesDetailPage", () => {
  const markSeriesSeenMock = vi.fn();
  const toggleEpisodeSeenMock = vi.fn();
  const markSeasonSeenMock = vi.fn();

  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    params.seriesId = "9";

    seriesQueryMock.mockReset().mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: buildSeries(),
    });

    seasonQueriesMock
      .mockReset()
      .mockReturnValue([{ data: buildSeason(), isPending: false, isError: false, refetch: vi.fn() }]);

    markSeriesSeenMock.mockReset().mockResolvedValue(undefined);
    toggleEpisodeSeenMock.mockReset().mockResolvedValue(undefined);
    markSeasonSeenMock.mockReset().mockResolvedValue(undefined);

    episodeProgressMock.mockReset().mockReturnValue({
      data: watchedProgress,
      isSaving: false,
      toggleEpisodeSeen: toggleEpisodeSeenMock,
      markSeasonSeen: markSeasonSeenMock,
      markSeriesSeen: markSeriesSeenMock,
    });

    trackedSeriesMock.mockReset().mockReturnValue({
      data: [
        {
          id: "t1",
          seriesId: 9,
          title: "Test Series",
          totalEpisodes: 3,
          watchedEpisodes: 2,
          status: "Returning Series",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
    refreshTrackedSeriesStatusMock.mockReset().mockResolvedValue(undefined);

    seasonAccordionPropsMock.mockReset();
    nextEpisodeCardPropsMock.mockReset();
  });

  it("shows the not-found empty state for a non-numeric seriesId, and nothing else", () => {
    params.seriesId = "abc";
    renderPage();

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("This page doesn't exist.")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("shows a hero skeleton while the series query is pending", () => {
    seriesQueryMock.mockReturnValue({
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });

    const { container } = renderPage();

    expect(container.querySelector(".rounded-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("shows a remote error state on query failure, and retry triggers refetch", () => {
    const refetch = vi.fn();
    seriesQueryMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("network down"),
      refetch,
      data: undefined,
    });

    renderPage();

    expect(screen.getByText("Unable to load the catalogue")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();

    screen.getByRole("button", { name: /Try again/i }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("computes series progress from real season/episode data and passes it down to the season/next-episode cards", () => {
    renderPage();

    // 2 of 3 episodes watched -> 67% (Math.round(2/3 * 100)), "2/3 ep."
    expect(screen.getByText("67")).toBeInTheDocument();
    expect(screen.getByText("2/3 ep.")).toBeInTheDocument();

    expect(seasonAccordionPropsMock).toHaveBeenCalledTimes(1);
    const [[seasonAccordionProps]] = seasonAccordionPropsMock.mock.calls as [
      [{ seasons: Season[]; watchedEpisodes: EpisodeProgress[] }],
    ];
    expect(seasonAccordionProps.seasons).toEqual([buildSeason()]);
    expect(seasonAccordionProps.watchedEpisodes).toEqual(watchedProgress);

    // getNextEpisode: episodes 1 and 2 are watched, episode 3 already aired
    // and is unwatched -> it's the next episode.
    expect(nextEpisodeCardPropsMock).toHaveBeenCalledWith(episodes[2]);
  });

  it("shows a partial-error state when a season query fails, and its retry calls that season's refetch", () => {
    const seasonRefetch = vi.fn();
    seasonQueriesMock.mockReturnValue([{ data: undefined, isPending: false, isError: true, refetch: seasonRefetch }]);

    renderPage();

    const partialErrorMessage = "Some seasons couldn't load, so marking the whole series is disabled until they do.";
    expect(screen.getAllByText(partialErrorMessage).length).toBeGreaterThan(0);

    // Only the season-section PartialErrorState renders a retry button — the
    // one alongside the seen toggle has no onRetry.
    const retryButton = screen.getByRole("button", { name: "Try again" });
    retryButton.click();
    expect(seasonRefetch).toHaveBeenCalledTimes(1);

    // Not every season loaded, so marking the whole series seen is disabled.
    expect(screen.getByTestId("seen-toggle")).toBeDisabled();
  });

  it("refreshes tracked series status when TMDB's fresh status differs from the locally tracked one", async () => {
    seriesQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: buildSeries({ status: "Ended" }),
    });
    trackedSeriesMock.mockReturnValue({
      data: [
        {
          id: "t1",
          seriesId: 9,
          title: "Test Series",
          totalEpisodes: 3,
          watchedEpisodes: 2,
          status: "Returning Series",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(refreshTrackedSeriesStatusMock).toHaveBeenCalledWith({ seriesId: 9, status: "Ended" }));
  });

  it("does not refresh tracked series status when it already matches TMDB's fresh status", () => {
    seriesQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: buildSeries({ status: "Returning Series" }),
    });
    trackedSeriesMock.mockReturnValue({
      data: [
        {
          id: "t1",
          seriesId: 9,
          title: "Test Series",
          totalEpisodes: 3,
          watchedEpisodes: 2,
          status: "Returning Series",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    renderPage();

    expect(refreshTrackedSeriesStatusMock).not.toHaveBeenCalled();
  });

  it("does not show the Up to date badge while an aired episode is still unwatched", () => {
    renderPage();

    expect(screen.queryByText("All up to date")).not.toBeInTheDocument();
  });

  it("shows the Up to date badge once every aired episode is watched but an unaired one is still ahead", () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const unairedEpisode: Episode = {
      id: 1004,
      seasonNumber: 1,
      episodeNumber: 4,
      title: "Episode 4",
      overview: "Not yet aired.",
      airDate: farFuture,
    };
    seasonQueriesMock.mockReturnValue([
      {
        data: buildSeason({ episodes: [...episodes, unairedEpisode] }),
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      },
    ]);
    episodeProgressMock.mockReturnValue({
      data: [
        ...watchedProgress,
        {
          id: "p3",
          seriesId: 9,
          episodeId: 1003,
          seasonNumber: 1,
          episodeNumber: 3,
          watched: true,
          createdAt: "2024-01-15T00:00:00.000Z",
          updatedAt: "2024-01-15T00:00:00.000Z",
        },
      ],
      isSaving: false,
      toggleEpisodeSeen: toggleEpisodeSeenMock,
      markSeasonSeen: markSeasonSeenMock,
      markSeriesSeen: markSeriesSeenMock,
    });

    renderPage();

    expect(screen.getByText("All up to date")).toBeInTheDocument();
  });

  it("marks the series seen with the flipped completed state when the seen toggle is clicked", () => {
    const series = buildSeries();
    seriesQueryMock.mockReturnValue({ isPending: false, isError: false, error: null, refetch: vi.fn(), data: series });

    renderPage();

    // 2/3 watched -> not completed yet, so toggling should ask to mark it watched.
    screen.getByTestId("seen-toggle").click();

    expect(markSeriesSeenMock).toHaveBeenCalledWith({ series, seasons: [buildSeason()], watched: true });
  });
});
