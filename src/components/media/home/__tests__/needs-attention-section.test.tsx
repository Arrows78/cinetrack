import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import {
  BACKLOG_THRESHOLD,
  NeedsAttentionSection,
  STALE_PLANNED_DAYS,
  selectBacklogSeries,
  selectStalePlannedItems,
} from "../needs-attention-section";
import type { LibraryItem, TrackedSeriesItem } from "@/types/media";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
}));

function makeSeries(overrides: Partial<TrackedSeriesItem> = {}): TrackedSeriesItem {
  return {
    id: "t1",
    profileId: null,
    seriesId: 1,
    title: "The Wire",
    posterPath: null,
    backdropPath: null,
    totalEpisodes: 10,
    watchedEpisodes: 3,
    status: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeLibraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "l1",
    profileId: "default",
    mediaId: 7,
    mediaType: "movie",
    title: "Dune",
    posterPath: null,
    backdropPath: null,
    year: 2021,
    rating: 8,
    genres: [],
    status: "planned",
    favourite: false,
    userRating: null,
    notes: null,
    tags: [],
    startedAt: null,
    completedAt: null,
    rewatchCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectBacklogSeries", () => {
  it("keeps only series with at least BACKLOG_THRESHOLD unwatched aired episodes", () => {
    const belowThreshold = makeSeries({ seriesId: 1, watchedEpisodes: 10 - (BACKLOG_THRESHOLD - 1) });
    const atThreshold = makeSeries({ seriesId: 2, watchedEpisodes: 10 - BACKLOG_THRESHOLD });

    expect(selectBacklogSeries([belowThreshold, atThreshold])).toEqual([
      { series: atThreshold, remaining: BACKLOG_THRESHOLD },
    ]);
  });
});

describe("selectStalePlannedItems", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it("keeps only planned items untouched for at least STALE_PLANNED_DAYS", () => {
    const fresh = makeLibraryItem({ mediaId: 1, updatedAt: daysAgo(STALE_PLANNED_DAYS - 1) });
    const stale = makeLibraryItem({ mediaId: 2, updatedAt: daysAgo(STALE_PLANNED_DAYS) });

    const result = selectStalePlannedItems([fresh, stale], now);

    expect(result).toEqual([{ item: stale, daysSinceUpdate: STALE_PLANNED_DAYS }]);
  });

  it("ignores non-planned items regardless of how stale they are", () => {
    const watching = makeLibraryItem({ status: "watching", updatedAt: daysAgo(400) });
    expect(selectStalePlannedItems([watching], now)).toEqual([]);
  });
});

describe("NeedsAttentionSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing when both backlog and stale are empty", () => {
    const { container } = render(<NeedsAttentionSection backlog={[]} stale={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a backlog row linking to the series, with the remaining-count badge", () => {
    const series = makeSeries({ seriesId: 5, title: "The Wire" });
    render(<NeedsAttentionSection backlog={[{ series, remaining: 4 }]} stale={[]} />);

    expect(screen.getByRole("heading", { name: i18n.t("home.needsAttentionTitle") })).toBeInTheDocument();
    expect(screen.getByText("The Wire")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.needsAttentionBacklogBadge", { count: 4 }))).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/series/$seriesId");
    expect(link).toHaveAttribute("data-params", JSON.stringify({ seriesId: "5" }));
  });

  it("renders a stale-planned row linking to the right media route, with the days-ago badge", () => {
    const item = makeLibraryItem({ mediaType: "movie", mediaId: 9, title: "Dune" });
    render(<NeedsAttentionSection backlog={[]} stale={[{ item, daysSinceUpdate: 45 }]} />);

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.needsAttentionStaleBadge", { days: 45 }))).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/movies/$movieId");
    expect(link).toHaveAttribute("data-params", JSON.stringify({ movieId: "9" }));
  });
});
