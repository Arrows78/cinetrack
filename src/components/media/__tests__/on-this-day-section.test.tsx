import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import type { ViewingEvent } from "@/types/media";

const { usePreferencesMock, useOnThisDayMock } = vi.hoisted(() => ({
  usePreferencesMock: vi.fn(),
  useOnThisDayMock: vi.fn(),
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => usePreferencesMock(),
}));

vi.mock("@/features/stats/use-stats", () => ({
  useOnThisDay: (enabled: boolean) => useOnThisDayMock(enabled),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
}));

import { OnThisDaySection } from "../on-this-day-section";

const event = (overrides: Partial<ViewingEvent> = {}): ViewingEvent => ({
  id: crypto.randomUUID(),
  profileId: "default",
  mediaId: 1,
  mediaType: "movie",
  title: "Oppenheimer",
  eventType: "watched",
  watchedAt: "2023-08-21T20:00:00.000Z",
  durationMinutes: null,
  episodeId: null,
  seasonNumber: null,
  episodeNumber: null,
  ...overrides,
});

describe("OnThisDaySection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    usePreferencesMock.mockReset();
    useOnThisDayMock.mockReset();
  });

  it("renders nothing when the opt-in preference is off, even if there's matching data", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: false } });
    useOnThisDayMock.mockReturnValue({ data: [event()] });

    const { container } = render(<OnThisDaySection />);

    expect(container).toBeEmptyDOMElement();
    // The query must be told it's disabled — not just have its result ignored.
    expect(useOnThisDayMock).toHaveBeenCalledWith(false);
  });

  it("renders nothing when enabled but there is no match for today", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: true } });
    useOnThisDayMock.mockReturnValue({ data: [] });

    const { container } = render(<OnThisDaySection />);

    expect(container).toBeEmptyDOMElement();
    expect(useOnThisDayMock).toHaveBeenCalledWith(true);
  });

  it("renders nothing while preferences are still loading (defaults to disabled)", () => {
    usePreferencesMock.mockReturnValue({ data: undefined });
    useOnThisDayMock.mockReturnValue({ data: undefined });

    const { container } = render(<OnThisDaySection />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the card with the date, title, and years-ago count for a single match", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: true } });
    const threeYearsAgo = new Date().getFullYear() - 3;
    useOnThisDayMock.mockReturnValue({
      data: [event({ title: "Oppenheimer", watchedAt: `${threeYearsAgo}-08-21T20:00:00.000Z` })],
    });

    render(<OnThisDaySection />);

    expect(screen.getByText("On this day")).toBeInTheDocument();
    expect(screen.getByText(/you watched Oppenheimer/)).toBeInTheDocument();
    expect(screen.getByText("3 years ago")).toBeInTheDocument();
  });

  it("links a movie match to the movie detail route and a series match to the series route", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: true } });
    useOnThisDayMock.mockReturnValue({
      data: [event({ mediaType: "series", mediaId: 77, title: "The Wire" })],
    });

    render(<OnThisDaySection />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/series/$seriesId");
    expect(link).toHaveAttribute("data-params", JSON.stringify({ seriesId: "77" }));
  });

  it("shows at most one entry per past year, most recent year first, capped to 3", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: true } });
    const currentYear = new Date().getFullYear();
    useOnThisDayMock.mockReturnValue({
      data: [
        event({ id: "y1", title: "Most Recent Year", watchedAt: `${currentYear - 1}-08-21T00:00:00.000Z` }),
        event({ id: "y2", title: "Two Years Ago", watchedAt: `${currentYear - 2}-08-21T00:00:00.000Z` }),
        event({ id: "y3", title: "Three Years Ago", watchedAt: `${currentYear - 3}-08-21T00:00:00.000Z` }),
        // A 4th distinct year beyond the display cap.
        event({ id: "y4", title: "Four Years Ago", watchedAt: `${currentYear - 4}-08-21T00:00:00.000Z` }),
        // A duplicate for the same year as the first entry — must not add a
        // second row for a year already shown.
        event({ id: "y1-dup", title: "Duplicate Same Year", watchedAt: `${currentYear - 1}-08-21T05:00:00.000Z` }),
      ],
    });

    render(<OnThisDaySection />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/Most Recent Year/)).toBeInTheDocument();
    expect(screen.getByText(/Two Years Ago/)).toBeInTheDocument();
    expect(screen.getByText(/Three Years Ago/)).toBeInTheDocument();
    expect(screen.queryByText(/Four Years Ago/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Duplicate Same Year/)).not.toBeInTheDocument();
  });
});
