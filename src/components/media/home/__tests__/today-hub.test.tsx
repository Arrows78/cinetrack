import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { TodayHub } from "../today-hub";
import type * as NeedsAttentionModule from "../needs-attention-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

const trackedSeriesMock = vi.fn();
vi.mock("@/features/progress/use-progress", () => ({
  useTrackedSeries: () => trackedSeriesMock(),
}));

const episodesMock = vi.fn();
vi.mock("@/features/progress/use-watch-next", () => ({
  useTodayHubEpisodes: () => episodesMock(),
}));

const availabilityMock = vi.fn();
vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilityStatus: () => availabilityMock(),
}));

const watchTonightMock = vi.fn();
vi.mock("@/features/watch-tonight/use-watch-tonight", () => ({
  useWatchTonightPicks: () => watchTonightMock(),
}));

const libraryCountsMock = vi.fn();
vi.mock("@/features/library/use-library", () => ({
  useLibraryStatusCounts: () => libraryCountsMock(),
}));

const stalePlannedMock = vi.fn();
const stalePlannedLimitSpy = vi.fn();
vi.mock("@/features/library/use-stale-planned-items", () => ({
  useStalePlannedItems: (limit: number) => {
    stalePlannedLimitSpy(limit);
    return stalePlannedMock();
  },
}));

const counts = (
  overrides: Partial<Record<"planned" | "watching" | "paused" | "completed" | "dropped", number>> = {}
) => ({
  isSuccess: true,
  isPending: false,
  data: { planned: 0, watching: 0, paused: 0, completed: 0, dropped: 0, ...overrides },
});

const preferencesMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => preferencesMock(),
}));

const becauseYouLikedMock = vi.fn();
vi.mock("@/features/media/use-because-you-liked", () => ({
  useBecauseYouLiked: () => becauseYouLikedMock(),
}));

const favouriteGenreRailMock = vi.fn();
vi.mock("@/components/media/detail/use-favourite-genre-rail", () => ({
  useFavouriteGenreRail: () => favouriteGenreRailMock(),
}));

const peopleYouWatchMock = vi.fn();
vi.mock("@/features/media/use-people-you-watch", () => ({
  usePeopleYouWatch: () => peopleYouWatchMock(),
}));

vi.mock("@/components/media/tracking/watch-next-section", () => ({
  WatchNextSection: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="watch-next-section" data-entries={entries.length} />
  ),
}));
vi.mock("@/components/media/home/up-next-section", () => ({
  UpNextSection: ({ entries }: { entries: unknown[] }) => <div data-testid="up-next" data-entries={entries.length} />,
}));
vi.mock("@/components/media/home/new-episodes-section", () => ({
  NewEpisodesSection: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="new-episodes" data-entries={entries.length} />
  ),
}));
vi.mock("@/components/media/home/available-now-section", () => ({
  AvailableNowSection: ({ statuses }: { statuses: unknown[] }) => (
    <div data-testid="available-now" data-entries={statuses.length} />
  ),
}));
vi.mock("@/components/media/home/alerts-section", () => ({
  AlertsSection: ({ statuses }: { statuses: unknown[] }) => <div data-testid="alerts" data-entries={statuses.length} />,
}));
vi.mock("@/components/media/home/watch-tonight-teaser-section", () => ({
  WatchTonightTeaserSection: ({ items }: { items: unknown[] }) => (
    <div data-testid="watch-tonight-teaser" data-entries={items.length} />
  ),
}));
vi.mock("@/components/media/home/personalized-recommendation-section", () => ({
  PersonalizedRecommendationSection: () => <div data-testid="recommendation" />,
}));
vi.mock("@/components/media/home/needs-attention-section", async () => {
  const actual = await vi.importActual<typeof NeedsAttentionModule>("../needs-attention-section");
  return {
    ...actual,
    NeedsAttentionSection: ({ backlog, stale }: { backlog: unknown[]; stale: unknown[] }) => (
      <div data-testid="needs-attention" data-backlog={backlog.length} data-stale={stale.length} />
    ),
  };
});

function emptyEpisodes() {
  return { continueWatching: [], upNext: [], newEpisodes: [], isLoading: false, isError: false, results: [] };
}

function emptyAvailability() {
  return { availableNow: [], pending: [], isLoading: false, isError: false };
}

describe("TodayHub", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");

    trackedSeriesMock.mockReset().mockReturnValue({ data: [] });
    episodesMock.mockReset().mockReturnValue(emptyEpisodes());
    availabilityMock.mockReset().mockReturnValue(emptyAvailability());
    watchTonightMock.mockReset().mockReturnValue({ data: { movies: [], series: [] }, isError: false, error: null });
    libraryCountsMock.mockReset().mockReturnValue(counts());
    stalePlannedMock.mockReset().mockReturnValue({ data: [], isError: false, error: null });
    stalePlannedLimitSpy.mockReset();
    preferencesMock.mockReset().mockReturnValue({ data: undefined });
    becauseYouLikedMock.mockReset().mockReturnValue({ seedTitle: null, items: [] });
    favouriteGenreRailMock.mockReset().mockReturnValue({ genre: null, items: [] });
    peopleYouWatchMock.mockReset().mockReturnValue({
      topDirector: null,
      directorItems: [],
      topActor: null,
      actorItems: [],
    });
  });

  it("nudges a brand new user to add their first title when library and tracked series are both empty", () => {
    render(<TodayHub index={1} />);

    expect(screen.getByText(i18n.t("home.todayHubEmptyTitle"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: i18n.t("home.todayHubEmptyCta") })).toHaveAttribute("href", "/search");
  });

  it("renders nothing when an existing user is simply caught up, rather than the new-user nudge", () => {
    libraryCountsMock.mockReturnValue(counts({ completed: 1 }));

    const { container } = render(<TodayHub index={1} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not show the new-user nudge while library/tracked-series reads are still pending", () => {
    libraryCountsMock.mockReturnValue({ data: undefined, isPending: true, isSuccess: false });
    trackedSeriesMock.mockReturnValue({ data: undefined, isPending: true });

    const { container } = render(<TodayHub index={1} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("tells the user when a secondary fetch failed, instead of only logging it", () => {
    availabilityMock.mockReturnValue({ ...emptyAvailability(), isError: true });

    render(<TodayHub index={1} />);

    expect(screen.getByText(i18n.t("home.todayHubPartialError"))).toBeInTheDocument();
  });

  it("stays mounted for the failure note even when every card is empty", () => {
    // Without this, a total secondary-fetch outage empties every card and
    // takes the whole hub — note included — down with it, wordlessly.
    episodesMock.mockReturnValue({ ...emptyEpisodes(), isError: true });
    availabilityMock.mockReturnValue({ ...emptyAvailability(), isError: true });
    watchTonightMock.mockReturnValue({ data: undefined, isError: true, error: new Error("boom") });

    const { container } = render(<TodayHub index={1} />);

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText(i18n.t("home.todayHubPartialError"))).toBeInTheDocument();
  });

  it("renders the hub heading with the given index once continueWatching has entries", () => {
    episodesMock.mockReturnValue({
      ...emptyEpisodes(),
      continueWatching: [{ series: { seriesId: 1 }, nextEpisode: { id: 1 }, remaining: 3 }],
    });

    render(<TodayHub index={2} />);

    expect(screen.getByText(i18n.t("home.todayHubTitle"))).toBeInTheDocument();
    expect(screen.getByTestId("watch-next-section")).toHaveAttribute("data-entries", "1");
  });

  it("renders when only upNext has entries", () => {
    episodesMock.mockReturnValue({ ...emptyEpisodes(), upNext: [{ series: {}, nextEpisode: {}, remaining: 5 }] });
    render(<TodayHub index={1} />);

    expect(screen.getByTestId("up-next")).toHaveAttribute("data-entries", "1");
  });

  it("renders when only availability has an availableNow entry", () => {
    availabilityMock.mockReturnValue({
      ...emptyAvailability(),
      availableNow: [{ alert: {}, matchedProviderIds: [8], available: true }],
    });
    render(<TodayHub index={1} />);

    expect(screen.getByTestId("available-now")).toHaveAttribute("data-entries", "1");
  });

  it("renders when only the Watch Tonight teaser has picks", () => {
    watchTonightMock.mockReturnValue({
      data: { movies: [{ id: 1, mediaType: "movie", title: "Dune" }], series: [] },
      isError: false,
      error: null,
    });
    render(<TodayHub index={1} />);

    expect(screen.getByTestId("watch-tonight-teaser")).toHaveAttribute("data-entries", "1");
  });

  it("renders when only the personalized recommendation has content", () => {
    becauseYouLikedMock.mockReturnValue({ seedTitle: "Arrival", items: [{ id: 1, title: "Interstellar" }] });
    render(<TodayHub index={1} />);

    expect(screen.getByTestId("recommendation")).toBeInTheDocument();
  });

  it("renders when only needs-attention has a backlog series", () => {
    const series = { seriesId: 1, totalEpisodes: 10, watchedEpisodes: 5 };
    trackedSeriesMock.mockReturnValue({ data: [series] });
    // selectBacklogSeries only counts a series once its resolved next
    // episode is non-null — see needs-attention-section.test.tsx for why.
    episodesMock.mockReturnValue({
      ...emptyEpisodes(),
      results: [{ series, nextEpisode: { id: 900 }, remaining: 5, isLoading: false, isError: false }],
    });
    render(<TodayHub index={1} />);

    expect(screen.getByTestId("needs-attention")).toHaveAttribute("data-backlog", "1");
  });

  it("renders when only needs-attention has a stale planned item", () => {
    libraryCountsMock.mockReturnValue(counts({ planned: 1 }));
    stalePlannedMock.mockReturnValue({
      data: [{ item: { status: "planned" }, daysSinceUpdate: 40 }],
      isError: false,
      error: null,
    });
    render(<TodayHub index={1} />);

    expect(screen.getByTestId("needs-attention")).toHaveAttribute("data-stale", "1");
    // Only the card's own row count is ever requested, never the whole library.
    expect(stalePlannedLimitSpy).toHaveBeenCalledWith(4);
  });

  it("does not claim a brand new user when the library count could not be read", () => {
    libraryCountsMock.mockReturnValue({ data: undefined, isPending: false, isSuccess: false });

    const { container } = render(<TodayHub index={1} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("tells the user when the stale planned titles failed to load", () => {
    stalePlannedMock.mockReturnValue({ data: undefined, isError: true, error: new Error("boom") });
    render(<TodayHub index={1} />);

    expect(screen.getByText(i18n.t("home.todayHubPartialError"))).toBeInTheDocument();
  });
});
