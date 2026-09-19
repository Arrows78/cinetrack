import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { TrackingCalendar } from "@/components/media/tracking/tracking-calendar";
import type { TrackingEntry } from "@/types/media";

// Same pattern as tracking-list.test.tsx: no RouterProvider exists in this
// render, so Link is stubbed down to a plain anchor.
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
    date: "2026-09-15",
    ...overrides,
  };
}

describe("TrackingCalendar", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    // Fixed "today" so the default month grid is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("places each entry on its own day cell within the current month", () => {
    const movie = makeEntry({
      id: "movie-1",
      mediaId: 10,
      mediaType: "movie",
      title: "Midnight Voyage",
      date: "2026-09-15",
    });
    const series = makeEntry({
      id: "series-1",
      mediaId: 20,
      mediaType: "series",
      title: "Discovery Series",
      date: "2026-09-20",
    });
    render(<TrackingCalendar entries={[movie, series]} />);

    expect(screen.getByText("September 2026")).toBeInTheDocument();

    const movieLink = screen.getByRole("link", { name: "Midnight Voyage" });
    expect(movieLink).toHaveAttribute("href", "/movies/$movieId");
    expect(movieLink).toHaveAttribute("data-params", JSON.stringify({ movieId: "10" }));

    const seriesLink = screen.getByRole("link", { name: "Discovery Series" });
    expect(seriesLink).toHaveAttribute("href", "/series/$seriesId");
    expect(seriesLink).toHaveAttribute("data-params", JSON.stringify({ seriesId: "20" }));
  });

  it("shows an overflow count when a day has more entries than fit", () => {
    const entries = ["Alpha", "Bravo", "Charlie", "Delta"].map((title, index) =>
      makeEntry({ id: `entry-${index}`, mediaId: index, title, date: "2026-09-15" })
    );
    render(<TrackingCalendar entries={entries} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Delta")).not.toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("navigates to the next and previous month", () => {
    render(<TrackingCalendar entries={[]} />);

    expect(screen.getByText("September 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("October 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("does not show entries from another month on this month's grid", () => {
    const otherMonthEntry = makeEntry({ title: "October Only", date: "2026-10-05" });
    render(<TrackingCalendar entries={[otherMonthEntry]} />);

    expect(screen.queryByText("October Only")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("October Only")).toBeInTheDocument();
  });
});
