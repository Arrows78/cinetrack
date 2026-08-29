import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import fallbackPoster from "@/assets/poster-placeholder.svg";
import { SeriesLibrarySections, MovieLibrarySections } from "@/components/media/library/library-sections";
import type { MediaGridItem } from "@/components/media/primitives/media-grid";
import type { NextEpisodeResult } from "@/features/progress/use-watch-next";
import type { Episode, TrackedSeriesItem, ViewingHistoryItem } from "@/types/media";

const {
  useNextEpisodesMock,
  useHistoryMock,
  useEpisodeProgressMock,
  useSeasonDetailsMock,
  useMovieSeenMock,
  toggleMovieSeenMock,
} = vi.hoisted(() => ({
  useNextEpisodesMock: vi.fn(),
  useHistoryMock: vi.fn(),
  useEpisodeProgressMock: vi.fn(),
  useSeasonDetailsMock: vi.fn(),
  useMovieSeenMock: vi.fn(),
  toggleMovieSeenMock: vi.fn(),
}));

vi.mock("@/features/progress/use-watch-next", () => ({
  useNextEpisodes: (seriesList: TrackedSeriesItem[]) => useNextEpisodesMock(seriesList),
}));

vi.mock("@/features/history/use-history", () => ({
  useHistory: () => useHistoryMock(),
}));

vi.mock("@/features/progress/use-progress", () => ({
  useEpisodeProgress: (seriesId: number) => useEpisodeProgressMock(seriesId),
  useMovieSeen: (movieId: number) => useMovieSeenMock(movieId),
}));

vi.mock("@/features/media/use-media", () => ({
  useSeasonDetails: (seriesId: number, seasonNumber: number) => useSeasonDetailsMock(seriesId, seasonNumber),
}));

// Stubbed to plain titles — this file's own test file (watch-next-section.test.tsx)
// already covers WatchNextRow's internal rendering/interaction; here we only
// need to assert library-sections chose to render it (and with which entry).
vi.mock("@/components/media/tracking/watch-next-section", () => ({
  WatchNextRow: ({ entry }: { entry: { series: TrackedSeriesItem } }) => (
    <div data-testid="watch-next-row">{entry.series.title}</div>
  ),
}));

vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: MediaGridItem[] }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: PropsWithChildren<{ to: string; params?: Record<string, string>; className?: string }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined} className={className}>
      {children}
    </a>
  ),
}));

function makeMediaItem(overrides: Partial<MediaGridItem> = {}): MediaGridItem {
  return {
    id: 1,
    mediaType: "series",
    title: "The Wire",
    overview: "",
    genres: [],
    cast: [],
    posterPath: "/wire.jpg",
    backdropPath: null,
    ...overrides,
  };
}

function makeTracked(overrides: Partial<TrackedSeriesItem> = {}): TrackedSeriesItem {
  return {
    id: "tracked-1",
    profileId: null,
    seriesId: 1,
    title: "The Wire",
    posterPath: "/wire.jpg",
    backdropPath: null,
    totalEpisodes: 60,
    watchedEpisodes: 10,
    status: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeNextEpisodeResult(overrides: Partial<NextEpisodeResult> = {}): NextEpisodeResult {
  return {
    series: makeTracked(),
    nextEpisode: null,
    remaining: 5,
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 100,
    seasonNumber: 1,
    episodeNumber: 3,
    title: "The Buys",
    overview: "",
    ...overrides,
  };
}

function makeHistoryEntry(overrides: Partial<ViewingHistoryItem> = {}): ViewingHistoryItem {
  return {
    id: "hist-1",
    mediaId: 1,
    mediaType: "series",
    title: "The Wire",
    action: "episode:watched",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SeriesLibrarySections / MovieLibrarySections", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useNextEpisodesMock.mockReset().mockReturnValue({ results: [], entries: [], isLoading: false });
    useHistoryMock.mockReset().mockReturnValue({ data: { pages: [] } });
    useEpisodeProgressMock.mockReset().mockReturnValue({ data: [], isLoading: false });
    useSeasonDetailsMock.mockReset().mockReturnValue({ data: undefined, isLoading: false });
    toggleMovieSeenMock.mockReset().mockResolvedValue(undefined);
    useMovieSeenMock
      .mockReset()
      .mockReturnValue({ isSaving: false, toggleMovieSeen: toggleMovieSeenMock, data: false });
  });

  describe("SeriesLibrarySections classification", () => {
    it("buckets in-progress vs haven't-started vs fully-finished (dropped) items, in grid mode", () => {
      const items: MediaGridItem[] = [
        makeMediaItem({ id: 1, title: "In Progress", progress: { watched: 3, total: 10 } }),
        makeMediaItem({ id: 2, title: "No Progress Field", progress: undefined }),
        makeMediaItem({ id: 3, title: "Zero Watched", progress: { watched: 0, total: 10 } }),
        makeMediaItem({ id: 4, title: "Fully Finished", progress: { watched: 10, total: 10 } }),
      ];

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="grid" />);

      const grids = screen.getAllByTestId("grid");
      // First grid = inProgress, second = haventStarted.
      expect(within(grids[0]!).getByText("In Progress")).toBeInTheDocument();
      expect(within(grids[1]!).getByText("No Progress Field")).toBeInTheDocument();
      expect(within(grids[1]!).getByText("Zero Watched")).toBeInTheDocument();
      expect(screen.queryByText("Fully Finished")).not.toBeInTheDocument();
    });

    it("uses the real tracked-series entry when present, and synthesizes an untracked stand-in otherwise", () => {
      const items: MediaGridItem[] = [
        makeMediaItem({ id: 1, title: "Tracked", progress: { watched: 3, total: 10 } }),
        makeMediaItem({ id: 2, title: "Untracked", progress: { watched: 2, total: 10 } }),
      ];
      const tracked = [makeTracked({ seriesId: 1, id: "real-tracked" })];

      render(<SeriesLibrarySections items={items} trackedSeries={tracked} viewMode="grid" />);

      const [inProgressList] = useNextEpisodesMock.mock.calls;
      const passedSeries: TrackedSeriesItem[] = inProgressList![0];
      expect(passedSeries).toHaveLength(2);
      expect(passedSeries[0]).toEqual(tracked[0]);
      expect(passedSeries[1]).toMatchObject({
        id: "untracked-2",
        seriesId: 2,
        title: "Untracked",
        totalEpisodes: 0,
        watchedEpisodes: 0,
      });
    });
  });

  describe("SeriesLibrarySections grid mode", () => {
    it("renders nothing for inProgress/haventStarted sections when both buckets are empty", () => {
      render(<SeriesLibrarySections items={[]} trackedSeries={[]} viewMode="grid" />);
      expect(screen.queryByTestId("grid")).not.toBeInTheDocument();
      expect(screen.queryByText(i18n.t("library.sections.watchNext"))).not.toBeInTheDocument();
      expect(screen.queryByText(i18n.t("library.sections.haventStarted"))).not.toBeInTheDocument();
    });

    it("renders only the haventStarted section when only that bucket is non-empty", () => {
      const items: MediaGridItem[] = [makeMediaItem({ id: 5, title: "Fresh Show", progress: undefined })];
      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="grid" />);

      expect(screen.queryByText(i18n.t("library.sections.watchNext"))).not.toBeInTheDocument();
      expect(screen.getByText(i18n.t("library.sections.haventStarted"))).toBeInTheDocument();
      expect(screen.getByTestId("grid")).toHaveTextContent("Fresh Show");
    });

    it("renders only the watchNext section when only inProgress is non-empty", () => {
      const items: MediaGridItem[] = [
        makeMediaItem({ id: 6, title: "Ongoing Show", progress: { watched: 2, total: 10 } }),
      ];
      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="grid" />);

      expect(screen.getByText(i18n.t("library.sections.watchNext"))).toBeInTheDocument();
      expect(screen.queryByText(i18n.t("library.sections.haventStarted"))).not.toBeInTheDocument();
      expect(screen.getByTestId("grid")).toHaveTextContent("Ongoing Show");
    });
  });

  describe("SeriesLibrarySections list mode", () => {
    it("renders EpisodeRowSection as null (no header) when results is empty for a bucket", () => {
      useNextEpisodesMock.mockReturnValue({ results: [], entries: [], isLoading: false });
      render(<SeriesLibrarySections items={[]} trackedSeries={[]} viewMode="list" />);

      expect(screen.queryByText(i18n.t("library.sections.watchNext"))).not.toBeInTheDocument();
      expect(screen.queryByText(i18n.t("library.sections.haventStarted"))).not.toBeInTheDocument();
    });

    // Items are given via the haventStarted bucket (progress undefined) so
    // only the "haven't started" useNextEpisodes() call receives a non-empty
    // series list — mockImplementation keys off that so the other
    // EpisodeRowSection (watch next, called with an empty list) stays empty
    // instead of rendering the same fixture twice.
    function mockSingleResult(result: NextEpisodeResult) {
      useNextEpisodesMock.mockImplementation((seriesList: TrackedSeriesItem[]) =>
        seriesList.length
          ? { results: [result], entries: [], isLoading: false }
          : { results: [], entries: [], isLoading: false }
      );
    }

    it("renders a WatchNextRow when result.nextEpisode is present", () => {
      mockSingleResult(
        makeNextEpisodeResult({ series: makeTracked({ title: "Has Next" }), nextEpisode: makeEpisode() })
      );
      const items: MediaGridItem[] = [makeMediaItem({ id: 1, progress: undefined })];

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      expect(screen.getByTestId("watch-next-row")).toHaveTextContent("Has Next");
    });

    it("renders a SeriesFallbackRow (loading state) when result.nextEpisode is null and isLoading", () => {
      mockSingleResult(
        makeNextEpisodeResult({
          series: makeTracked({ seriesId: 42, title: "Loading Show" }),
          nextEpisode: null,
          isLoading: true,
          isError: false,
        })
      );
      const items: MediaGridItem[] = [makeMediaItem({ id: 1, progress: undefined })];

      const { container } = render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      expect(screen.getByText("Loading Show")).toBeInTheDocument();
      expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
      expect(container.querySelector(".animate-spin")).toBeInTheDocument();
      const link = screen.getAllByRole("link").find((el) => el.textContent?.includes("Loading Show"));
      expect(link).toHaveAttribute("data-params", JSON.stringify({ seriesId: "42" }));
    });

    it("renders a SeriesFallbackRow (error state, no spinner) when result.nextEpisode is null and isError", () => {
      mockSingleResult(
        makeNextEpisodeResult({
          series: makeTracked({ title: "Error Show" }),
          nextEpisode: null,
          isLoading: false,
          isError: true,
        })
      );
      const items: MediaGridItem[] = [makeMediaItem({ id: 1, progress: undefined })];

      const { container } = render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      expect(screen.getByText(i18n.t("library.sections.episodeLoadError"))).toBeInTheDocument();
      expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
    });

    it("renders a SeriesFallbackRow (no aired episode, neither loading nor error)", () => {
      mockSingleResult(
        makeNextEpisodeResult({
          series: makeTracked({ title: "No Episode Show" }),
          nextEpisode: null,
          isLoading: false,
          isError: false,
        })
      );
      const items: MediaGridItem[] = [makeMediaItem({ id: 1, progress: undefined })];

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      expect(screen.getByText(i18n.t("media.noAiredEpisode"))).toBeInTheDocument();
    });

    it("falls back to the placeholder poster when the fallback row's series has no posterPath", () => {
      mockSingleResult(
        makeNextEpisodeResult({
          series: makeTracked({ title: "No Poster Show", posterPath: null }),
          nextEpisode: null,
        })
      );
      const items: MediaGridItem[] = [makeMediaItem({ id: 1, progress: undefined })];

      const { container } = render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);
      const images = container.querySelectorAll("img");
      expect(images[0]).toHaveAttribute("src", fallbackPoster);
    });
  });

  describe("RecentlyWatchedSection (via SeriesLibrarySections list mode)", () => {
    const items: MediaGridItem[] = [makeMediaItem({ id: 1, title: "The Wire", progress: undefined })];

    it("returns null (no header) when nothing in history matches", () => {
      useHistoryMock.mockReturnValue({ data: { pages: [[]] } });
      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);
      expect(screen.queryByText(i18n.t("library.sections.recentlyWatched"))).not.toBeInTheDocument();
    });

    it("tolerates historyQuery.data being undefined (no pages loaded yet)", () => {
      useHistoryMock.mockReturnValue({ data: undefined });
      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);
      expect(screen.queryByText(i18n.t("library.sections.recentlyWatched"))).not.toBeInTheDocument();
    });

    it("falls back to the placeholder poster in RecentlyWatchedRow when the matched item has no posterPath", () => {
      const posterlessItems: MediaGridItem[] = [
        makeMediaItem({ id: 1, title: "The Wire", progress: undefined, posterPath: null }),
      ];
      const entry = makeHistoryEntry({
        mediaType: "series",
        mediaId: 1,
        action: "episode:watched",
        seasonNumber: 1,
        episodeNumber: 1,
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[entry]] } });

      const { container } = render(
        <SeriesLibrarySections items={posterlessItems} trackedSeries={[]} viewMode="list" />
      );

      const images = container.querySelectorAll("img");
      expect(images[0]).toHaveAttribute("src", fallbackPoster);
    });

    it("excludes entries failing mediaType, WATCHED_ACTIONS, or itemsById individually, includes one passing all three", () => {
      const wrongMediaType = makeHistoryEntry({ id: "a", mediaType: "movie", mediaId: 1 });
      const wrongAction = makeHistoryEntry({ id: "b", mediaType: "series", mediaId: 1, action: "watchlist:add" });
      const unknownMedia = makeHistoryEntry({ id: "c", mediaType: "series", mediaId: 999, action: "episode:watched" });
      const matching = makeHistoryEntry({
        id: "d",
        mediaType: "series",
        mediaId: 1,
        action: "episode:watched",
        episodeNumber: 4,
        seasonNumber: 1,
        episodeTitle: "Old Cases",
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[wrongMediaType, wrongAction, unknownMedia, matching]] } });

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      expect(screen.getByText(i18n.t("library.sections.recentlyWatched"))).toBeInTheDocument();
      // One row rendered — the S/E code from the matching entry's inline episode data.
      expect(screen.getByText("S01E04")).toBeInTheDocument();
      expect(screen.getByText("Old Cases")).toBeInTheDocument();
    });

    it("caps at RECENTLY_WATCHED_LIMIT (10) even when more entries match", () => {
      const entries = Array.from({ length: 15 }, (_, i) =>
        makeHistoryEntry({ id: `e${i}`, mediaType: "series", mediaId: 1, action: "episode:watched", episodeNumber: i })
      );
      useHistoryMock.mockReturnValue({ data: { pages: [entries] } });

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      // 10 rows rendered under the recently-watched section — count links whose
      // target is the series route (fallback rows / grid aren't present here).
      const seriesLinks = screen.getAllByRole("link").filter((el) => el.getAttribute("href") === "/series/$seriesId");
      expect(seriesLinks).toHaveLength(10);
    });

    it("renders a movie row (isMovie branch) via MovieLibrarySections in list mode", () => {
      const movieEntry = makeHistoryEntry({
        id: "m1",
        mediaType: "movie",
        mediaId: 7,
        action: "movie:watched",
        title: "Heat",
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[movieEntry]] } });
      const movieItems: MediaGridItem[] = [
        makeMediaItem({ id: 7, mediaType: "movie", title: "Heat", alreadySeen: true }),
      ];

      render(<MovieLibrarySections items={movieItems} viewMode="list" />);

      const link = screen.getByRole("link", { name: /Heat/ });
      expect(link).toHaveAttribute("href", "/movies/$movieId");
      expect(link).toHaveAttribute("data-params", JSON.stringify({ movieId: "7" }));
    });
  });

  describe("useResolvedRecentEpisode via RecentlyWatchedRow", () => {
    const items: MediaGridItem[] = [makeMediaItem({ id: 1, title: "The Wire", progress: undefined })];

    it("hasInlineEpisode: uses the entry's inline episode data directly, no lookup queries", () => {
      const entry = makeHistoryEntry({
        mediaType: "series",
        mediaId: 1,
        action: "episode:watched",
        seasonNumber: 2,
        episodeNumber: 5,
        episodeTitle: "Duck and Cover",
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[entry]] } });

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      expect(screen.getByText("S02E05")).toBeInTheDocument();
      expect(screen.getByText("Duck and Cover")).toBeInTheDocument();
      // Lookup hooks called with NaN (disabled) since no lookup was needed.
      expect(useEpisodeProgressMock).toHaveBeenCalledWith(Number.NaN);
      expect(useSeasonDetailsMock).toHaveBeenCalledWith(1, Number.NaN);
    });

    it("needsLookup with resolved lastWatched: picks the highest season/episode via reduce, resolves title from season details", () => {
      const entry = makeHistoryEntry({
        id: "season-entry",
        mediaType: "series",
        mediaId: 1,
        action: "season:watched",
        episodeNumber: undefined,
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[entry]] } });
      // Ordered to exercise every branch of the reduce's ternary:
      // A(s1e5) is the initial `latest`.
      // B(s1e2): same season, lower episode -> second clause false -> `latest` wins (stays A).
      // C(s2e1): higher season -> first clause true -> `item` wins (latest becomes C).
      // D(s1e9): lower season, season not equal -> both clauses false -> `latest` wins (stays C).
      // E(s2e3): same season as C, higher episode -> second clause true -> `item` wins (latest becomes E).
      const progressItem = (overrides: Partial<{ seasonNumber: number; episodeNumber: number; watched: boolean }>) => ({
        id: `p-${overrides.seasonNumber}-${overrides.episodeNumber}`,
        seriesId: 1,
        episodeId: 1,
        seasonNumber: 1,
        episodeNumber: 1,
        watched: true,
        createdAt: "",
        updatedAt: "",
        ...overrides,
      });
      useEpisodeProgressMock.mockReturnValue({
        data: [
          progressItem({ seasonNumber: 1, episodeNumber: 5 }), // A
          progressItem({ seasonNumber: 1, episodeNumber: 2 }), // B
          progressItem({ seasonNumber: 2, episodeNumber: 1 }), // C
          progressItem({ seasonNumber: 1, episodeNumber: 9 }), // D
          progressItem({ seasonNumber: 2, episodeNumber: 3 }), // E
          progressItem({ seasonNumber: 3, episodeNumber: 1, watched: false }), // excluded by the watched filter
        ],
        isLoading: false,
      });
      useSeasonDetailsMock.mockReturnValue({
        data: { episodes: [makeEpisode({ episodeNumber: 3, title: "Resolved Title" })] },
        isLoading: false,
      });

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      // Final winner is season 2 / episode 3 (E).
      expect(screen.getByText("S02E03")).toBeInTheDocument();
      expect(screen.getByText("Resolved Title")).toBeInTheDocument();
      expect(useSeasonDetailsMock).toHaveBeenCalledWith(1, 2);
    });

    it("needsLookup with no watched progress at all: lastWatched stays null, falls through to progressQuery.isLoading", () => {
      const entry = makeHistoryEntry({
        id: "season-entry-2",
        mediaType: "series",
        mediaId: 1,
        action: "season:watched",
        episodeNumber: undefined,
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[entry]] } });
      // `data: undefined` (not just an empty array) exercises the `progressQuery.data ?? []` fallback itself.
      useEpisodeProgressMock.mockReturnValue({ data: undefined, isLoading: true });

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      // Neither episodeNumber nor episodeTitle resolved -> loading text shown.
      expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
      expect(screen.queryByText(/^S\d\dE\d\d$/)).not.toBeInTheDocument();
    });

    it("shows neither the S/E code nor loading text when episode.episodeNumber is undefined and isLoading is false", () => {
      const entry = makeHistoryEntry({
        id: "season-entry-3",
        mediaType: "series",
        mediaId: 1,
        action: "season:watched",
        episodeNumber: undefined,
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[entry]] } });
      useEpisodeProgressMock.mockReturnValue({ data: [], isLoading: false });

      render(<SeriesLibrarySections items={items} trackedSeries={[]} viewMode="list" />);

      expect(screen.queryByText(i18n.t("common.loading"))).not.toBeInTheDocument();
      expect(screen.queryByText(/^S\d\dE\d\d$/)).not.toBeInTheDocument();
    });
  });

  describe("MovieLibrarySections", () => {
    it("renders RecentlyWatchedSection only in list mode, not grid", () => {
      const movieEntry = makeHistoryEntry({
        id: "m1",
        mediaType: "movie",
        mediaId: 7,
        action: "movie:watched",
        title: "Heat",
      });
      useHistoryMock.mockReturnValue({ data: { pages: [[movieEntry]] } });
      const movieItems: MediaGridItem[] = [makeMediaItem({ id: 7, mediaType: "movie", title: "Heat" })];

      const { rerender } = render(<MovieLibrarySections items={movieItems} viewMode="list" />);
      expect(screen.getByText(i18n.t("library.sections.recentlyWatched"))).toBeInTheDocument();

      rerender(<MovieLibrarySections items={movieItems} viewMode="grid" />);
      expect(screen.queryByText(i18n.t("library.sections.recentlyWatched"))).not.toBeInTheDocument();
    });

    it("filters notWatched to items with alreadySeen falsy, and renders nothing when notWatched is empty", () => {
      const movieItems: MediaGridItem[] = [makeMediaItem({ id: 1, mediaType: "movie", alreadySeen: true })];
      render(<MovieLibrarySections items={movieItems} viewMode="grid" />);
      expect(screen.queryByText(i18n.t("library.sections.haventStarted"))).not.toBeInTheDocument();
    });

    it("renders the haventStarted section (with excluded/included items) and grid contents in grid mode", () => {
      const movieItems: MediaGridItem[] = [
        makeMediaItem({ id: 1, mediaType: "movie", title: "Seen Movie", alreadySeen: true }),
        makeMediaItem({ id: 2, mediaType: "movie", title: "Unseen Movie", alreadySeen: false }),
      ];
      render(<MovieLibrarySections items={movieItems} viewMode="grid" />);

      expect(screen.getByText(i18n.t("library.sections.haventStarted"))).toBeInTheDocument();
      const grid = screen.getByTestId("grid");
      expect(within(grid).getByText("Unseen Movie")).toBeInTheDocument();
      expect(within(grid).queryByText("Seen Movie")).not.toBeInTheDocument();
    });

    it("renders MovieWatchNextRow entries in list mode, with year fallback and genre shown", () => {
      const movieItems: MediaGridItem[] = [
        makeMediaItem({
          id: 2,
          mediaType: "movie",
          title: "Unseen Movie",
          alreadySeen: false,
          year: undefined,
          genres: [],
        }),
      ];
      render(<MovieLibrarySections items={movieItems} viewMode="list" />);

      expect(screen.getByText("Unseen Movie")).toBeInTheDocument();
      expect(screen.getByText(i18n.t("media.unknownYear"))).toBeInTheDocument();
    });

    it("falls back to the placeholder poster in MovieWatchNextRow when posterPath is null", () => {
      const movieItems: MediaGridItem[] = [
        makeMediaItem({ id: 5, mediaType: "movie", title: "Posterless Movie", alreadySeen: false, posterPath: null }),
      ];
      const { container } = render(<MovieLibrarySections items={movieItems} viewMode="list" />);

      const images = container.querySelectorAll("img");
      expect(images[0]).toHaveAttribute("src", fallbackPoster);
    });

    it("shows the year and genre[0] when both are present", () => {
      const movieItems: MediaGridItem[] = [
        makeMediaItem({
          id: 3,
          mediaType: "movie",
          title: "Dated Movie",
          alreadySeen: false,
          year: 1999,
          genres: ["Crime", "Drama"],
        }),
      ];
      render(<MovieLibrarySections items={movieItems} viewMode="list" />);

      expect(screen.getByText("1999 · Crime")).toBeInTheDocument();
    });

    it("calls toggleMovieSeen when the seen toggle is clicked", () => {
      const media = makeMediaItem({ id: 4, mediaType: "movie", title: "Clickable Movie", alreadySeen: false });
      render(<MovieLibrarySections items={[media]} viewMode="list" />);

      fireEvent.click(screen.getByRole("button", { name: i18n.t("media.markAsSeen") }));

      expect(toggleMovieSeenMock).toHaveBeenCalledWith({ movie: media, watched: true });
    });

    it("renders MediaGrid instead of MovieWatchNextRow in grid mode", () => {
      const movieItems: MediaGridItem[] = [
        makeMediaItem({ id: 2, mediaType: "movie", title: "Unseen Movie", alreadySeen: false }),
      ];
      render(<MovieLibrarySections items={movieItems} viewMode="grid" />);

      expect(screen.getByTestId("grid")).toHaveTextContent("Unseen Movie");
      expect(screen.queryByRole("button", { name: i18n.t("media.markAsSeen") })).not.toBeInTheDocument();
    });
  });
});
