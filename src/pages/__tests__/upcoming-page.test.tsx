import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { UpcomingPage } from "../upcoming-page";
import { useTracking } from "@/features/tracking/use-tracking";
import type { TrackingEntry } from "@/types/media";

vi.mock("@/features/tracking/use-tracking", () => ({
  useTracking: vi.fn(),
}));

// UpcomingEntryRow has its own dedicated test suite (its data needs
// useSeasonDetails/useEpisodeProgress, irrelevant to this page's own
// grouping/empty/error-state logic) — shallow-mocked here, same pattern as
// season-page.test.tsx mocking EpisodeCard.
vi.mock("@/components/media/tracking/upcoming-entry-row", () => ({
  UpcomingEntryRow: ({ entry }: { entry: TrackingEntry }) => <div data-testid={`entry-${entry.id}`}>{entry.title}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: PropsWithChildren<{ to: string }>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const mockUseTracking = useTracking as unknown as ReturnType<typeof vi.fn>;

function makeEntry(overrides: Partial<TrackingEntry>): TrackingEntry {
  return {
    id: "entry-1",
    mediaId: 1,
    mediaType: "series",
    title: "Entry title",
    type: "episode",
    scope: "mine",
    date: "2026-09-01",
    ...overrides,
  };
}

function trackingResult(overrides: Partial<Record<string, unknown>> = {}) {
  return { data: [] as TrackingEntry[], isLoading: false, isError: false, error: null, refetch: vi.fn(), ...overrides };
}

function renderPage() {
  return render(<UpcomingPage />);
}

describe("UpcomingPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTracking.mockReturnValue(trackingResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the loading state while tracking is loading", () => {
    mockUseTracking.mockReturnValue(trackingResult({ isLoading: true }));
    renderPage();

    expect(screen.getByText("Loading tracking…")).toBeInTheDocument();
  });

  it("shows a remote error state and retries via tracking.refetch", () => {
    const refetch = vi.fn();
    mockUseTracking.mockReturnValue(trackingResult({ isError: true, error: new Error("boom"), refetch }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when there is nothing to show", () => {
    renderPage();
    expect(screen.getByText("Nothing upcoming")).toBeInTheDocument();
  });

  it("groups mine-scoped release/episode entries by date, under a formatted date heading", () => {
    mockUseTracking.mockReturnValue(
      trackingResult({
        data: [
          makeEntry({ id: "1", title: "Episode A", date: "2026-09-01" }),
          makeEntry({ id: "2", title: "Episode B", date: "2026-09-01" }),
          makeEntry({ id: "3", title: "Movie C", type: "release", date: "2026-09-05" }),
        ],
      })
    );
    renderPage();

    expect(screen.getByTestId("entry-1")).toBeInTheDocument();
    expect(screen.getByTestId("entry-2")).toBeInTheDocument();
    expect(screen.getByTestId("entry-3")).toBeInTheDocument();
    expect(screen.queryByText("Nothing upcoming")).not.toBeInTheDocument();
  });

  it("excludes discovery-scoped and availability entries", () => {
    mockUseTracking.mockReturnValue(
      trackingResult({
        data: [
          makeEntry({ id: "discovery", scope: "discovery" }),
          makeEntry({ id: "availability", type: "availability", date: null }),
        ],
      })
    );
    renderPage();

    expect(screen.queryByTestId("entry-discovery")).not.toBeInTheDocument();
    expect(screen.queryByTestId("entry-availability")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing upcoming")).toBeInTheDocument();
  });
});
