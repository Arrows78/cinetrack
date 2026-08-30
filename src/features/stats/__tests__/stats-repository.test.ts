import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { makeLibraryItem } from "@/shared/test-utils";
import type { ViewingEvent } from "@/types/media";

const invokeCommandMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/invoke", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    invokeTypedCommand: (command: { name: string }, args?: Record<string, unknown>) =>
      args === undefined ? invokeCommandMock(command.name) : invokeCommandMock(command.name, args),
  };
});

const libraryListMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: { list: libraryListMock },
}));

import { monthOverMonthComparison } from "../stats-repository";

const libraryItem = makeLibraryItem;

// currentStreak/longestStreak/biggestBingeDay/viewingHeatmap/libraryExtras/
// computeForecast used to be pure TS functions tested here directly — they
// now run as SQL aggregates in Rust (get_activity_stats/get_library_extras/
// get_watch_forecast, see src-tauri/src/stats/mod.rs's own test suite for
// their coverage), matching how totals/monthly-activity were already
// aggregated in Rust before this. What's left as pure, unit-testable TS is
// monthOverMonthComparison (a transform over already-aggregated data, not a
// duplicate of anything Rust does) and getYearSummary's title/genre ranking
// below (the year-range scoping itself happens in Rust and is exercised
// there — see list_viewing_events_for_year's own tests).

describe("monthOverMonthComparison", () => {
  it("returns null with fewer than two months of activity", () => {
    expect(monthOverMonthComparison([])).toBeNull();
    expect(monthOverMonthComparison([{ month: "2026-06", count: 3, minutes: 90 }])).toBeNull();
  });

  it("compares the last two months and signs the deltas", () => {
    const result = monthOverMonthComparison([
      { month: "2026-05", count: 4, minutes: 200 },
      { month: "2026-06", count: 7, minutes: 150 },
    ]);

    expect(result).toEqual({
      current: { count: 7, minutes: 150 },
      previous: { count: 4, minutes: 200 },
      countDelta: 3,
      minutesDelta: -50,
    });
  });
});

describe("statsRepository.getYearSummary", () => {
  beforeEach(() => {
    invokeCommandMock.mockReset();
    libraryListMock.mockReset();
  });

  const viewingEvent = (overrides: Partial<ViewingEvent>): ViewingEvent =>
    ({
      id: crypto.randomUUID(),
      profileId: DEFAULT_PROFILE_ID,
      mediaId: 1,
      mediaType: "movie",
      title: "Film A",
      eventType: "watched",
      watchedAt: "2026-02-01T00:00:00.000Z",
      durationMinutes: 0,
      ...overrides,
    }) as ViewingEvent;

  it("aggregates the given year's events, ranking top titles and favourite genre", async () => {
    const year = 2026;
    libraryListMock.mockResolvedValue([
      libraryItem({ mediaId: 1, mediaType: "movie", title: "Film A", genres: ["Drame"] }),
      // A second title/genre so topTitles and favouriteGenre each have more
      // than one entry to rank — otherwise Array.sort never calls its
      // comparator on a single-element input and the sort branch goes untested.
      libraryItem({ mediaId: 3, mediaType: "movie", title: "Film B", genres: ["Comédie"] }),
    ]);
    invokeCommandMock.mockResolvedValue([
      viewingEvent({ mediaId: 1, title: "Film A", watchedAt: `${year}-02-01T00:00:00.000Z`, durationMinutes: 100 }),
      viewingEvent({ mediaId: 1, title: "Film A", watchedAt: `${year}-03-01T00:00:00.000Z`, durationMinutes: 50 }),
      viewingEvent({ mediaId: 3, title: "Film B", watchedAt: `${year}-04-01T00:00:00.000Z`, durationMinutes: 20 }),
    ]);
    const { statsRepository: repo } = await import("../stats-repository");

    const summary = await repo.getYearSummary(year);

    expect(invokeCommandMock).toHaveBeenCalledWith("list_viewing_events_for_year", {
      rangeStart: `${year}-01-01T00:00:00.000Z`,
      rangeEnd: `${year + 1}-01-01T00:00:00.000Z`,
    });
    expect(summary.movies).toBe(3);
    expect(summary.minutes).toBe(170);
    expect(summary.activeDays).toBe(3);
    expect(summary.topTitles[0]).toEqual({ title: "Film A", count: 2 });
    expect(summary.topTitles).toContainEqual({ title: "Film B", count: 1 });
    // Both Drame and Comédie appear exactly once (one matching library item
    // each) — favouriteGenre just needs to be one of the tied candidates.
    expect(["Drame", "Comédie"]).toContain(summary.favouriteGenre);
  });

  it("excludes an unwatched rollback event from the aggregation", async () => {
    libraryListMock.mockResolvedValue([libraryItem({ mediaId: 1, mediaType: "movie", genres: ["Drame"] })]);
    invokeCommandMock.mockResolvedValue([
      viewingEvent({ mediaId: 1, eventType: "watched", durationMinutes: 100 }),
      viewingEvent({ mediaId: 1, eventType: "unwatched", durationMinutes: 100 }),
    ]);
    const { statsRepository: repo } = await import("../stats-repository");

    const summary = await repo.getYearSummary(2026);

    expect(summary.movies).toBe(1);
    expect(summary.minutes).toBe(100);
  });

  it("defaults a missing duration to zero and reports no favourite genre when no library item matches this year's events", async () => {
    // mediaId 99 has no event below, so its genre must never be credited —
    // genreCounts stays empty, which is what exercises the `?? null` fallback.
    libraryListMock.mockResolvedValue([
      libraryItem({ mediaId: 99, mediaType: "movie", title: "Unrelated", genres: ["Horreur"] }),
    ]);
    invokeCommandMock.mockResolvedValue([viewingEvent({ mediaId: 1, title: "Film A", durationMinutes: null })]);
    const { statsRepository: repo } = await import("../stats-repository");

    const summary = await repo.getYearSummary(2026);

    expect(summary.minutes).toBe(0);
    expect(summary.favouriteGenre).toBeNull();
  });
});

describe("statsRepository.getStats", () => {
  beforeEach(() => {
    invokeCommandMock.mockReset();
  });

  it("assembles the overview, activity and library-extras commands into one LibraryStats", async () => {
    invokeCommandMock.mockImplementation((commandName: string) => {
      switch (commandName) {
        case "get_stats_overview":
          return Promise.resolve({
            totals: {
              moviesWatched: 12,
              episodesWatched: 340,
              minutesWatched: 5000,
              movieMinutesWatched: 2000,
              episodeMinutesWatched: 3000,
              completedSeries: 4,
              libraryCompletionPercent: 62,
            },
            monthlyActivity: [{ month: "2026-06", count: 7, minutes: 150 }],
          });
        case "get_activity_stats":
          return Promise.resolve({
            currentStreakDays: 3,
            longestStreakDays: 9,
            biggestBingeDay: null,
            heatmap: [],
          });
        case "get_library_extras":
          return Promise.resolve({
            averageUserRating: 4.2,
            favouriteGenres: [],
            favouriteGenreByRating: "Drame",
            mostRewatchedTitle: null,
          });
        default:
          throw new Error(`unexpected command ${commandName}`);
      }
    });
    const { statsRepository: repo } = await import("../stats-repository");

    const stats = await repo.getStats();

    expect(stats.moviesWatched).toBe(12);
    expect(stats.libraryCompletionPercent).toBe(62);
    expect(stats.currentStreakDays).toBe(3);
    expect(stats.averageUserRating).toBe(4.2);
    expect(stats.favouriteGenreByRating).toBe("Drame");
    expect(invokeCommandMock).toHaveBeenCalledWith(
      "get_stats_overview",
      expect.objectContaining({ monthLabels: expect.any(Array) })
    );
    expect(invokeCommandMock).toHaveBeenCalledWith(
      "get_activity_stats",
      expect.objectContaining({
        since: expect.any(String),
        today: expect.any(String),
        tzOffsetMinutes: expect.any(Number),
      })
    );
    expect(invokeCommandMock).toHaveBeenCalledWith("get_library_extras");
  });
});

describe("statsRepository.getForecast", () => {
  beforeEach(() => {
    invokeCommandMock.mockReset();
  });

  it("passes a recent-events window and a pace window to get_watch_forecast", async () => {
    invokeCommandMock.mockResolvedValue({
      backlogEpisodes: 8,
      backlogMinutes: 320,
      episodesPerWeek: 5,
      catchUpDate: null,
    });
    const { statsRepository: repo } = await import("../stats-repository");

    const forecast = await repo.getForecast();

    expect(forecast.backlogMinutes).toBe(320);
    expect(invokeCommandMock).toHaveBeenCalledWith(
      "get_watch_forecast",
      expect.objectContaining({
        since: expect.any(String),
        paceWindowStart: expect.any(String),
        now: expect.any(String),
      })
    );
  });
});

describe("statsRepository.getYearlyActivity", () => {
  beforeEach(() => {
    invokeCommandMock.mockReset();
  });

  it("returns the yearly activity buckets from list_yearly_activity", async () => {
    invokeCommandMock.mockResolvedValue([
      { year: 2025, moviesWatched: 20, episodesWatched: 300, minutesWatched: 4000 },
      { year: 2026, moviesWatched: 12, episodesWatched: 340, minutesWatched: 5000 },
    ]);
    const { statsRepository: repo } = await import("../stats-repository");

    const buckets = await repo.getYearlyActivity();

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({ year: 2025, moviesWatched: 20, episodesWatched: 300, minutesWatched: 4000 });
    expect(invokeCommandMock).toHaveBeenCalledWith("list_yearly_activity");
  });
});
