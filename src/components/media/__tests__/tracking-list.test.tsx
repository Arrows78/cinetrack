import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { TrackingList } from "@/components/media/tracking-list";
import type { TrackingEntry } from "@/types/media";

const useTrackingMock = vi.fn();
const useAvailabilityAlertsMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/features/tracking/use-tracking", () => ({
  useTracking: () => useTrackingMock(),
}));

vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilityAlerts: () => useAvailabilityAlertsMock(),
}));

// Same pattern as design-system-page.test.tsx: no RouterProvider exists in
// this render, so Link is stubbed down to a plain anchor.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
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
    fireEvent.click(within(screen.getByRole("group", { name: "Scope" })).getByRole("button", { name: "All" }));

    // Available-now panel.
    const availableHeading = screen.getByRole("heading", { name: "Available now" });
    expect(within(availableHeading.parentElement as HTMLElement).getByText("Available Movie")).toBeInTheDocument();

    // Awaiting-availability panel.
    const pendingHeading = screen.getByRole("heading", { name: "Waiting for availability" });
    expect(within(pendingHeading.parentElement as HTMLElement).getByText("Pending Series")).toBeInTheDocument();

    // Dated entries, one panel per date, each showing only its own entries.
    const sept1Heading = screen.getByRole("heading", { name: /1 September 2026/i });
    const sept1Panel = sept1Heading.parentElement as HTMLElement;
    expect(within(sept1Panel).getByText("Mine Movie")).toBeInTheDocument();
    expect(within(sept1Panel).queryByText("Discovery Series")).not.toBeInTheDocument();

    const sept2Heading = screen.getByRole("heading", { name: /2 September 2026/i });
    const sept2Panel = sept2Heading.parentElement as HTMLElement;
    expect(within(sept2Panel).getByText("Discovery Series")).toBeInTheDocument();
    expect(within(sept2Panel).getByText("S2E5 · The Return")).toBeInTheDocument();
    expect(within(sept2Panel).queryByText("Mine Movie")).not.toBeInTheDocument();
  });

  it("shows both release and episode type-filter options when no media type is locked", () => {
    mockTracking({ data: [] });
    render(<TrackingList />);

    const typeGroup = screen.getByRole("group", { name: "Type" });
    expect(within(typeGroup).getByRole("button", { name: "Releases" })).toBeInTheDocument();
    expect(within(typeGroup).getByRole("button", { name: "Episodes" })).toBeInTheDocument();
    expect(within(typeGroup).getByRole("button", { name: "Availability" })).toBeInTheDocument();
  });

  it("hides the episode filter option when locked to movies", () => {
    mockTracking({ data: [] });
    render(<TrackingList lockedMediaType="movie" />);

    const typeGroup = screen.getByRole("group", { name: "Type" });
    expect(within(typeGroup).getByRole("button", { name: "Releases" })).toBeInTheDocument();
    expect(within(typeGroup).queryByRole("button", { name: "Episodes" })).not.toBeInTheDocument();
  });

  it("hides the release filter option when locked to series", () => {
    mockTracking({ data: [] });
    render(<TrackingList lockedMediaType="series" />);

    const typeGroup = screen.getByRole("group", { name: "Type" });
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

    fireEvent.click(within(screen.getByRole("group", { name: "Scope" })).getByRole("button", { name: "All" }));

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

    fireEvent.click(within(screen.getByRole("group", { name: "Scope" })).getByRole("button", { name: "All" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(removeMock).toHaveBeenCalledExactlyOnceWith("alert-1");
  });

  it("does not call remove when confirming removal of an entry without an alertId", () => {
    mockTracking({ data: [pendingEntryNoAlert] });
    render(<TrackingList />);

    fireEvent.click(screen.getByRole("button", { name: "Remove the alert for No Alert Series" }));
    expect(screen.getByText('Remove the alert for "No Alert Series"?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("renders the empty state when no entries match the current filters", () => {
    mockTracking({ data: [] });
    render(<TrackingList />);

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
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
});
