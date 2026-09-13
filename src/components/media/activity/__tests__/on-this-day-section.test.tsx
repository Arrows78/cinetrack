import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { ON_THIS_DAY_INVITE_DISMISSED_KEY } from "@/shared/constants/local-storage-keys";
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

import { OnThisDayInviteBanner, OnThisDaySection } from "../on-this-day-section";

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

describe("OnThisDayInviteBanner", () => {
  const updatePreferenceMock = vi.fn();

  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    usePreferencesMock.mockReset();
    useOnThisDayMock.mockReset();
    updatePreferenceMock.mockReset();
    localStorage.removeItem(ON_THIS_DAY_INVITE_DISMISSED_KEY);
  });

  it("renders nothing when the preference is already on", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: true }, updatePreference: updatePreferenceMock });
    useOnThisDayMock.mockReturnValue({ data: [event()] });

    const { container } = render(<OnThisDayInviteBanner />);

    expect(container).toBeEmptyDOMElement();
    expect(useOnThisDayMock).toHaveBeenCalledWith(false);
  });

  it("renders nothing while preferences are still loading", () => {
    usePreferencesMock.mockReturnValue({ data: undefined, updatePreference: updatePreferenceMock });
    useOnThisDayMock.mockReturnValue({ data: undefined });

    const { container } = render(<OnThisDayInviteBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no match for today", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: false }, updatePreference: updatePreferenceMock });
    useOnThisDayMock.mockReturnValue({ data: [] });

    const { container } = render(<OnThisDayInviteBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the invite with an Enable CTA when there is a match and the preference is off", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: false }, updatePreference: updatePreferenceMock });
    useOnThisDayMock.mockReturnValue({ data: [event()] });

    render(<OnThisDayInviteBanner />);

    expect(screen.getByText('You have an "On this day" memory')).toBeInTheDocument();
  });

  it("enables the preference when the CTA is clicked", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: false }, updatePreference: updatePreferenceMock });
    useOnThisDayMock.mockReturnValue({ data: [event()] });

    render(<OnThisDayInviteBanner />);
    fireEvent.click(screen.getByRole("button", { name: 'Enable "On this day"' }));

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "onThisDayEnabled", value: true });
  });

  it("dismisses the banner for the day without touching the preference", () => {
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: false }, updatePreference: updatePreferenceMock });
    useOnThisDayMock.mockReturnValue({ data: [event()] });

    render(<OnThisDayInviteBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(updatePreferenceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ON_THIS_DAY_INVITE_DISMISSED_KEY)).toBe(new Date().toISOString().slice(0, 10));
  });

  it("stays dismissed for the remainder of the day on a fresh render", () => {
    localStorage.setItem(ON_THIS_DAY_INVITE_DISMISSED_KEY, new Date().toISOString().slice(0, 10));
    usePreferencesMock.mockReturnValue({ data: { onThisDayEnabled: false }, updatePreference: updatePreferenceMock });
    useOnThisDayMock.mockReturnValue({ data: [event()] });

    const { container } = render(<OnThisDayInviteBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
