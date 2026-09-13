import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { TrackingList } from "@/components/media/tracking/tracking-list";
import type { Episode, EpisodeProgress, TrackingEntry } from "@/types/media";

const useTrackingMock = vi.fn();
const useAvailabilityAlertsMock = vi.fn();
const removeMock = vi.fn();
const useSeasonDetailsMock = vi.fn();
const useEpisodeProgressMock = vi.fn();
const toggleEpisodeSeenMock = vi.fn();

vi.mock("@/features/tracking/use-tracking", () => ({
  useTracking: () => useTrackingMock(),
}));

vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilityAlerts: () => useAvailabilityAlertsMock(),
}));

// Backs TrackingEntryRow's EpisodeAiredStatus (showAiredStatus, always on for
// TrackingList) — defaults to "season still loading" so every existing test
// below that doesn't care about aired-episode behavior stays unaffected.
vi.mock("@/features/media/use-media", () => ({
  useSeasonDetails: () => useSeasonDetailsMock(),
}));
vi.mock("@/features/progress/use-progress", () => ({
  useEpisodeProgress: () => useEpisodeProgressMock(),
}));

// Same pattern as design-system-page.test.tsx: no RouterProvider exists in
// this render, so Link is stubbed down to a plain anchor.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
}));

function makeEntry(overrides: Partial<TrackingEntry>): TrackingEntry {
  return {
    id: "entry-1",
    mediaId: 1,
    mediaType: "movie",
    title: "Entry title",
    type: "release",
    scope: "mine",
    date: "2026-09-01",
    ...overrides,
  };
}

const releaseMine = makeEntry({
  id: "release-mine",
  mediaId: 10,
  title: "Mine Movie",
  type: "release",
  scope: "mine",
  date: "2026-09-01",
});

const episodeDiscovery = makeEntry({
  id: "episode-discovery",
  mediaId: 20,
  mediaType: "series",
  title: "Discovery Series",
  type: "episode",
  scope: "discovery",
  date: "2026-09-02",
  seasonNumber: 2,
  episodeNumber: 5,
  episodeTitle: "The Return",
});

const availableEntry = makeEntry({
  id: "available-1",
  mediaId: 30,
  mediaType: "movie",
  title: "Available Movie",
  type: "availability",
  scope: "mine",
  date: null,
  available: true,
  region: "FR",
  providerIds: [8],
  alertId: "alert-1",
});

const pendingEntryWithAlert = makeEntry({
  id: "pending-1",
  mediaId: 40,
  mediaType: "series",
  title: "Pending Series",
  type: "availability",
  scope: "mine",
  date: null,
  available: false,
  region: "US",
  providerIds: [],
  alertId: "alert-2",
});

const pendingEntryNoAlert = makeEntry({
  id: "pending-2",
  mediaId: 41,
  mediaType: "series",
  title: "No Alert Series",
  type: "availability",
  scope: "mine",
  date: null,
  available: false,
  region: "US",
  providerIds: [],
});

const availableOnNetflix = makeEntry({
  id: "available-netflix",
  mediaId: 50,
  mediaType: "movie",
  title: "Zeta Movie",
  type: "availability",
  scope: "mine",
  date: null,
  available: true,
  region: "FR",
  providerIds: [8], // Netflix
  alertId: "alert-netflix",
});

const availableOnDisneyPlus = makeEntry({
  id: "available-disney",
  mediaId: 51,
  mediaType: "movie",
  title: "Alpha Movie",
  type: "availability",
  scope: "mine",
  date: null,
  available: true,
  region: "FR",
  providerIds: [337], // Disney+
  alertId: "alert-disney",
});

function mockTracking(overrides: Partial<ReturnType<typeof useTrackingMock>> = {}) {
  useTrackingMock.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function mockAlerts(overrides: Partial<ReturnType<typeof useAvailabilityAlertsMock>> = {}) {
  useAvailabilityAlertsMock.mockReturnValue({
    data: [],
    isLoading: false,
    remove: removeMock,
    isRemoving: false,
    ...overrides,
  });
}

describe("TrackingList", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useTrackingMock.mockReset();
    useAvailabilityAlertsMock.mockReset();
    removeMock.mockReset().mockResolvedValue(undefined);
    mockTracking();
    mockAlerts();
    useSeasonDetailsMock.mockReset().mockReturnValue({ data: undefined });
    useEpisodeProgressMock.mockReset().mockReturnValue({
      data: [] as EpisodeProgress[],
      isSaving: false,
      toggleEpisodeSeen: toggleEpisodeSeenMock,
    });
    toggleEpisodeSeenMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a loading state while tracking data is loading", () => {
    mockTracking({ isLoading: true, data: undefined });
    render(<TrackingList />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading tracking…");
  });

  it("renders a remote error state with a working retry", () => {
    const refetch = vi.fn();
    mockTracking({ isError: true, error: new Error("boom"), refetch, data: undefined });
    render(<TrackingList />);

    expect(screen.getByText("Unable to load the catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("groups availability entries into available-now and pending, and dated entries by date", () => {
    mockTracking({ data: [releaseMine, episodeDiscovery, availableEntry, pendingEntryWithAlert] });
    render(<TrackingList />);

    // episodeDiscovery is scope "discovery"; switch to the "all" scope so
    // both dated entries are visible for this grouping-focused assertion.
    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter by scope" })).getByRole("button", { name: "All" })
    );

    // Available-now panel.
    const availableHeading = screen.getByRole("heading", { name: "Available now" });
    expect(within(availableHeading.parentElement as HTMLElement).getByText("Available Movie")).toBeInTheDocument();

    // Awaiting-availability panel.
    const pendingHeading = screen.getByRole("heading", { name: "Waiting for availability" });
    expect(within(pendingHeading.parentElement as HTMLElement).getByText("Pending Series")).toBeInTheDocument();

    // Dated entries, one panel per date, each showing only its own entries.
    // The heading now sits in its own row (alongside the countdown chip
    // added by formatRelativeCountdown — see tracking-list.tsx), so the
    // panel is the heading's grandparent, not its direct parent.
    const sept1Heading = screen.getByRole("heading", { name: /1 September 2026/i });
    const sept1Panel = sept1Heading.parentElement?.parentElement as HTMLElement;
    expect(within(sept1Panel).getByText("Mine Movie")).toBeInTheDocument();
    expect(within(sept1Panel).queryByText("Discovery Series")).not.toBeInTheDocument();

    const sept2Heading = screen.getByRole("heading", { name: /2 September 2026/i });
    const sept2Panel = sept2Heading.parentElement?.parentElement as HTMLElement;
    expect(within(sept2Panel).getByText("Discovery Series")).toBeInTheDocument();
    expect(within(sept2Panel).getByText("S2E5 · The Return")).toBeInTheDocument();
    expect(within(sept2Panel).queryByText("Mine Movie")).not.toBeInTheDocument();
  });

  it("opens an episode entry on the isolated season route, not the dashboard-rail search-param route", () => {
    mockTracking({ data: [episodeDiscovery] });
    render(<TrackingList lockedMediaType="series" />);

    // episodeDiscovery is scope "discovery"; the default scope filter is
    // "mine", so switch to "all" to see it.
    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter by scope" })).getByRole("button", { name: "All" })
    );

    const link = screen.getByText("Discovery Series").closest("a");
    expect(link).toHaveAttribute("href", "/series/$seriesId/season/$seasonNumber");
    expect(link).toHaveAttribute("data-params", JSON.stringify({ seriesId: "20", seasonNumber: "2" }));
  });

  it("shows both release and episode type-filter options when no media type is locked", () => {
    mockTracking({ data: [] });
    render(<TrackingList />);

    const typeGroup = screen.getByRole("group", { name: "Filter by type" });
    expect(within(typeGroup).getByRole("button", { name: "Releases" })).toBeInTheDocument();
    expect(within(typeGroup).getByRole("button", { name: "Episodes" })).toBeInTheDocument();
    expect(within(typeGroup).getByRole("button", { name: "Availability" })).toBeInTheDocument();
  });

  it("hides the episode filter option when locked to movies", () => {
    mockTracking({ data: [] });
    render(<TrackingList lockedMediaType="movie" />);

    const typeGroup = screen.getByRole("group", { name: "Filter by type" });
    expect(within(typeGroup).getByRole("button", { name: "Releases" })).toBeInTheDocument();
    expect(within(typeGroup).queryByRole("button", { name: "Episodes" })).not.toBeInTheDocument();
  });

  it("hides the release filter option when locked to series", () => {
    mockTracking({ data: [] });
    render(<TrackingList lockedMediaType="series" />);

    const typeGroup = screen.getByRole("group", { name: "Filter by type" });
    expect(within(typeGroup).queryByRole("button", { name: "Releases" })).not.toBeInTheDocument();
    expect(within(typeGroup).getByRole("button", { name: "Episodes" })).toBeInTheDocument();
  });

  it("filters to only availability entries when the availability type filter is selected", () => {
    mockTracking({ data: [releaseMine, episodeDiscovery, availableEntry] });
    render(<TrackingList />);

    fireEvent.click(screen.getByRole("button", { name: "Availability" }));

    expect(screen.getByText("Available Movie")).toBeInTheDocument();
    expect(screen.queryByText("Mine Movie")).not.toBeInTheDocument();
    expect(screen.queryByText("Discovery Series")).not.toBeInTheDocument();
  });

  it("filters between mine and all scope", () => {
    mockTracking({ data: [releaseMine, episodeDiscovery] });
    render(<TrackingList />);

    // Default scope is "mine".
    expect(screen.getByText("Mine Movie")).toBeInTheDocument();
    expect(screen.queryByText("Discovery Series")).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter by scope" })).getByRole("button", { name: "All" })
    );

    expect(screen.getByText("Mine Movie")).toBeInTheDocument();
    expect(screen.getByText("Discovery Series")).toBeInTheDocument();
  });

  it("only shows the scope badge on release tiles when scope filter is 'all'", () => {
    mockTracking({ data: [releaseMine, episodeDiscovery] });
    render(<TrackingList />);

    // scopeFilter defaults to "mine": no badge shown at all (only the
    // scope-filter button itself carries this text).
    expect(screen.queryByText("My titles", { selector: "div" })).not.toBeInTheDocument();
    expect(screen.queryByText("Discovery")).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter by scope" })).getByRole("button", { name: "All" })
    );

    // Now scope badges appear: "mine" entry gets the scopeMine badge, the
    // discovery entry gets the discovery badge.
    const mineHeading = screen.getByText("Mine Movie");
    expect(within(mineHeading.parentElement as HTMLElement).getByText("My titles")).toBeInTheDocument();
    const discoveryHeading = screen.getByText("Discovery Series");
    expect(within(discoveryHeading.parentElement as HTMLElement).getByText("Discovery")).toBeInTheDocument();
  });

  it("opens a confirm dialog on remove and removes the alert when the entry has an alertId", () => {
    mockTracking({ data: [availableEntry] });
    render(<TrackingList />);

    fireEvent.click(screen.getByRole("button", { name: "Remove the alert for Available Movie" }));

    expect(screen.getByText('Remove the alert for "Available Movie"?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeMock).toHaveBeenCalledExactlyOnceWith("alert-1");
  });

  it("does not call remove when confirming removal of an entry without an alertId", () => {
    mockTracking({ data: [pendingEntryNoAlert] });
    render(<TrackingList />);

    fireEvent.click(screen.getByRole("button", { name: "Remove the alert for No Alert Series" }));
    expect(screen.getByText('Remove the alert for "No Alert Series"?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("renders the genuinely-empty state, with a catalogue CTA, when there is no tracking data at all", () => {
    mockTracking({ data: [] });
    render(<TrackingList />);

    expect(screen.getByText("Nothing tracked yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Discover movies & series" })).toHaveAttribute("href", "/search");
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });

  it("renders the filtered-to-empty state, with a filter-reset action, when data exists but the current filters exclude all of it", () => {
    mockTracking({ data: [episodeDiscovery] });
    render(<TrackingList />);

    // Default scope is "mine"; episodeDiscovery is scope "discovery", so it's
    // filtered out even though tracking.data is non-empty.
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
    expect(screen.queryByText("Nothing tracked yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByText("Discovery Series")).toBeInTheDocument();
  });

  it("renders and wires up the browse-all button when results are present", () => {
    const onBrowseAll = vi.fn();
    mockTracking({ data: [releaseMine] });
    render(<TrackingList onBrowseAll={onBrowseAll} browseAllLabel="See all upcoming" />);

    const button = screen.getByRole("button", { name: "See all upcoming" });
    fireEvent.click(button);

    expect(onBrowseAll).toHaveBeenCalledTimes(1);
  });

  it("does not render the browse-all button when there are no results", () => {
    const onBrowseAll = vi.fn();
    mockTracking({ data: [] });
    render(<TrackingList onBrowseAll={onBrowseAll} browseAllLabel="See all upcoming" />);

    expect(screen.queryByRole("button", { name: "See all upcoming" })).not.toBeInTheDocument();
  });

  it("switching sort to title drops the date-group panels for one flat, alphabetical list", () => {
    mockTracking({ data: [releaseMine, episodeDiscovery] });
    render(<TrackingList />);

    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter by scope" })).getByRole("button", { name: "All" })
    );
    fireEvent.click(within(screen.getByRole("group", { name: "Sort by" })).getByRole("button", { name: "Title" }));

    expect(screen.queryByRole("heading", { name: /1 September 2026/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /2 September 2026/i })).not.toBeInTheDocument();

    // Alphabetical: "Discovery Series" before "Mine Movie".
    const titles = screen.getAllByText(/Discovery Series|Mine Movie/).map((el) => el.textContent);
    expect(titles).toEqual(["Discovery Series", "Mine Movie"]);
  });

  it("switching sort to platform reorders the availability tiles by provider name, alphabetically", () => {
    // Deliberately seeded in Netflix-then-Disney+ order — "platform" sort
    // should flip that to Disney+ first ("D" before "N"), independent of the
    // titles ("Zeta" before "Alpha" alphabetically, the opposite order).
    mockTracking({ data: [availableOnNetflix, availableOnDisneyPlus] });
    render(<TrackingList />);

    fireEvent.click(within(screen.getByRole("group", { name: "Sort by" })).getByRole("button", { name: "Platform" }));

    const titles = screen.getAllByText(/Zeta Movie|Alpha Movie/).map((el) => el.textContent);
    expect(titles).toEqual(["Alpha Movie", "Zeta Movie"]);
  });

  it("defaults to controlled scope/type/sort when passed, instead of its own local state", () => {
    const onScopeFilterChange = vi.fn();
    mockTracking({ data: [releaseMine, episodeDiscovery] });
    render(
      <TrackingList
        scopeFilter="all"
        onScopeFilterChange={onScopeFilterChange}
        typeFilter="all"
        onTypeFilterChange={vi.fn()}
        sort="date"
        onSortChange={vi.fn()}
      />
    );

    // Controlled scopeFilter="all" shows both entries immediately, without
    // needing to click the scope filter button first (unlike the uncontrolled
    // default of "mine" exercised by the other tests above).
    expect(screen.getByText("Mine Movie")).toBeInTheDocument();
    expect(screen.getByText("Discovery Series")).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("group", { name: "Filter by scope" })).getByRole("button", { name: "My titles" })
    );
    expect(onScopeFilterChange).toHaveBeenCalledExactlyOnceWith("mine");
  });

  // These absorb what used to be the standalone /upcoming page's own
  // behavior (UpcomingEntryRow) — merged in via showAiredStatus instead of
  // duplicating TrackingList's data/layout in a second page.
  describe("aired status (merged from the former standalone Upcoming page)", () => {
    const airedRelease = makeEntry({
      id: "aired-release",
      mediaId: 50,
      mediaType: "movie",
      title: "Past Movie",
      type: "release",
      scope: "mine",
      date: "2020-01-01",
    });

    const airedEpisode = makeEntry({
      id: "aired-episode",
      mediaId: 60,
      mediaType: "series",
      title: "Aired Series",
      type: "episode",
      scope: "mine",
      date: "2020-01-01",
      seasonNumber: 1,
      episodeNumber: 1,
    });

    function episodeFixture(overrides: Partial<Episode> = {}): Episode {
      return { id: 700, seasonNumber: 1, episodeNumber: 1, title: "Pilot", overview: "", ...overrides };
    }

    it("shows an Aired badge instead of a countdown for a past release", () => {
      mockTracking({ data: [airedRelease] });
      render(<TrackingList />);

      expect(screen.getByText("Past Movie")).toBeInTheDocument();
      expect(screen.getByText("Aired")).toBeInTheDocument();
    });

    it("shows a New badge and an unwatched quick-check for an aired, unwatched episode", () => {
      useSeasonDetailsMock.mockReturnValue({ data: { episodes: [episodeFixture()] } });
      mockTracking({ data: [airedEpisode] });
      render(<TrackingList />);

      expect(screen.getByText("New")).toBeInTheDocument();
      const toggle = screen.getByRole("button", { name: "Mark watched" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });

    it("shows an Aired badge and a checked quick-check for an aired, watched episode, and toggling calls through", () => {
      useSeasonDetailsMock.mockReturnValue({ data: { episodes: [episodeFixture()] } });
      useEpisodeProgressMock.mockReturnValue({
        data: [{ episodeId: 700 } as EpisodeProgress],
        isSaving: false,
        toggleEpisodeSeen: toggleEpisodeSeenMock,
      });
      mockTracking({ data: [airedEpisode] });
      render(<TrackingList />);

      const toggle = screen.getByRole("button", { name: "Mark unwatched" });
      expect(toggle).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(toggle);
      expect(toggleEpisodeSeenMock).toHaveBeenCalledWith({
        series: { id: 60, mediaType: "series", title: "Aired Series", overview: "", genres: [], cast: [] },
        episode: episodeFixture(),
        watched: false,
      });
    });

    it("shows a plain countdown badge, no Aired/New badge, for an episode still to come", () => {
      mockTracking({
        data: [makeEntry({ ...airedEpisode, id: "future-episode", date: "2099-01-01" })],
      });
      render(<TrackingList />);

      fireEvent.click(within(screen.getByRole("group", { name: "Sort by" })).getByRole("button", { name: "Title" }));

      expect(screen.queryByText("New")).not.toBeInTheDocument();
      expect(screen.queryByText("Aired")).not.toBeInTheDocument();
      expect(screen.getByText(/^(Today|Tomorrow|In \d+ (day|days|week|weeks))$/)).toBeInTheDocument();
    });
  });
});
