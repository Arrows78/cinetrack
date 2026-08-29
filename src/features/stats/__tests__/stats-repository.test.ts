import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { makeLibraryItem } from "@/shared/test-utils";
import type { LibraryItem, TrackedSeriesItem, ViewingEvent } from "@/types/media";

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

import {
  biggestBingeDay,
  computeForecast,
  currentStreak,
  libraryExtras,
  longestStreak,
  monthOverMonthComparison,
  viewingHeatmap,
} from "../stats-repository";

const libraryItem = makeLibraryItem;

const event = (overrides: Partial<ViewingEvent> = {}): ViewingEvent =>
  ({
    id: crypto.randomUUID(),
    profileId: DEFAULT_PROFILE_ID,
    mediaId: 1,
    mediaType: "movie",
    title: "Test",
    eventType: "watched",
    watchedAt: new Date().toISOString(),
    durationMinutes: 100,
    ...overrides,
  }) as ViewingEvent;

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const trackedSeries = (overrides: Partial<TrackedSeriesItem> = {}): TrackedSeriesItem => ({
  id: crypto.randomUUID(),
  profileId: DEFAULT_PROFILE_ID,
  seriesId: 1,
  title: "Test Series",
  posterPath: null,
  backdropPath: null,
  totalEpisodes: 10,
  watchedEpisodes: 4,
  status: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

let episodeIdCounter = 0;
const episodeEvent = (overrides: Partial<ViewingEvent> = {}): ViewingEvent =>
  event({ mediaType: "series", episodeId: (episodeIdCounter += 1), ...overrides });

describe("currentStreak / libraryExtras", () => {
  // Totals (movies/episodes/minutes watched, completed series, library
  // completion) and monthly activity are now aggregated in SQL — see
  // src-tauri/src/commands/stats.rs's own test suite for their coverage.
  // What's left as pure, unit-testable TS is genre/rating extraction from
  // the (much smaller) library table, and the streak walk over events.
  it("extracts favourite genres from the library", () => {
    const library = [
      {
        profileId: DEFAULT_PROFILE_ID,
        mediaId: 1,
        mediaType: "movie",
        title: "Test",
        overview: "",
        genres: ["Drama"],
        cast: [],
        status: "completed",
        favourite: false,
        tags: [],
        rewatchCount: 0,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ] as unknown as LibraryItem[];

    expect(libraryExtras(library).favouriteGenres[0]).toEqual({ name: "Drama", count: 1 });
  });

  it("computes the average user rating across rated items", () => {
    const library = [
      libraryItem({ mediaId: 1, userRating: 8, status: "completed" }),
      libraryItem({ mediaId: 2, userRating: 6, status: "planned" }),
      libraryItem({ mediaId: 3, mediaType: "series", status: "completed", userRating: null }),
    ];

    expect(libraryExtras(library).averageUserRating).toBe(7);
    expect(libraryExtras([]).averageUserRating).toBeNull();
  });

  it("counts a streak of consecutive watching days and breaks it on a gap", () => {
    const consecutive = [
      event({ watchedAt: isoDaysAgo(0) }),
      event({ watchedAt: isoDaysAgo(1) }),
      event({ watchedAt: isoDaysAgo(2) }),
    ];
    expect(currentStreak(consecutive)).toBe(3);

    const withGap = [event({ watchedAt: isoDaysAgo(0) }), event({ watchedAt: isoDaysAgo(2) })];
    expect(currentStreak(withGap)).toBe(1);

    expect(currentStreak([])).toBe(0);
  });

  it("ignores unwatched events in the streak", () => {
    expect(currentStreak([event({ eventType: "unwatched" })])).toBe(0);
  });

  it("picks the genre with the highest average rating, ignoring unrated items", () => {
    const library = [
      libraryItem({ mediaId: 1, genres: ["Drama"], userRating: 9 }),
      libraryItem({ mediaId: 2, genres: ["Drama"], userRating: 7 }),
      libraryItem({ mediaId: 3, genres: ["Comedy"], userRating: 8.5 }),
      libraryItem({ mediaId: 4, genres: ["Horror"], userRating: null }),
    ];

    // Drama averages 8, Comedy averages 8.5 — Comedy should win despite
    // Drama having more rated entries.
    expect(libraryExtras(library).favouriteGenreByRating).toBe("Comedy");
    expect(libraryExtras([]).favouriteGenreByRating).toBeNull();
  });

  it("finds the most rewatched library item", () => {
    const library = [
      libraryItem({ mediaId: 1, title: "Once", rewatchCount: 0 }),
      libraryItem({ mediaId: 2, title: "Thrice", rewatchCount: 3 }),
      libraryItem({ mediaId: 3, title: "Twice", rewatchCount: 2 }),
    ];

    expect(libraryExtras(library).mostRewatchedTitle).toEqual({ title: "Thrice", count: 3 });
    expect(libraryExtras([libraryItem({ rewatchCount: 0 })]).mostRewatchedTitle).toBeNull();
  });
});

describe("longestStreak", () => {
  it("finds the longest run of consecutive days, not just the trailing one", () => {
    const events = [
      event({ watchedAt: isoDaysAgo(10) }),
      event({ watchedAt: isoDaysAgo(9) }),
      event({ watchedAt: isoDaysAgo(8) }),
      event({ watchedAt: isoDaysAgo(7) }),
      // Gap here — a shorter, more recent streak follows.
      event({ watchedAt: isoDaysAgo(1) }),
      event({ watchedAt: isoDaysAgo(0) }),
    ];

    expect(longestStreak(events)).toBe(4);
    expect(longestStreak([])).toBe(0);
  });

  it("ignores unwatched events", () => {
    expect(longestStreak([event({ eventType: "unwatched" })])).toBe(0);
  });
});

describe("biggestBingeDay", () => {
  it("finds the day with the most watches, not the most recent one", () => {
    const events = [
      event({ watchedAt: isoDaysAgo(10) }),
      event({ watchedAt: isoDaysAgo(3) }),
      event({ watchedAt: isoDaysAgo(3) }),
      event({ watchedAt: isoDaysAgo(3) }),
      event({ watchedAt: isoDaysAgo(0) }),
    ];

    const result = biggestBingeDay(events);

    expect(result?.count).toBe(3);
  });

  it("ignores unwatched events and returns null when there's nothing to rank", () => {
    expect(biggestBingeDay([event({ eventType: "unwatched" })])).toBeNull();
    expect(biggestBingeDay([])).toBeNull();
  });
});

describe("viewingHeatmap", () => {
  it("buckets watches by day-of-week and hour, zero-filling the rest", () => {
    const fixed = new Date("2026-06-15T20:30:00.000Z"); // a Monday, 20:00 UTC
    const buckets = viewingHeatmap([
      event({ watchedAt: fixed.toISOString() }),
      event({ watchedAt: fixed.toISOString() }),
    ]);

    expect(buckets).toHaveLength(7 * 24);
    const populated = buckets.filter((bucket) => bucket.count > 0);
    expect(populated).toHaveLength(1);
    expect(populated[0]!.count).toBe(2);
    expect(populated[0]!.day).toBe(fixed.getDay());
    expect(populated[0]!.hour).toBe(fixed.getHours());
  });

  it("ignores unwatched events", () => {
    const buckets = viewingHeatmap([event({ eventType: "unwatched" })]);
    expect(buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

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

describe("computeForecast", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");

  it("returns no backlog and a null catch-up date with nothing tracked", () => {
    const forecast = computeForecast([], [], now);

    expect(forecast).toEqual({
      backlogEpisodes: 0,
      backlogMinutes: 0,
      episodesPerWeek: 0,
      catchUpDate: null,
    });
  });

  it("sums backlog across series, clamping a series with more watched than total to zero", () => {
    const tracked = [
      trackedSeries({ totalEpisodes: 10, watchedEpisodes: 4 }), // 6 left
      trackedSeries({ totalEpisodes: 5, watchedEpisodes: 5 }), // 0 left
      trackedSeries({ totalEpisodes: 3, watchedEpisodes: 8 }), // over-watched (import artifact) -> 0, not negative
    ];

    const forecast = computeForecast(tracked, [], now);

    expect(forecast.backlogEpisodes).toBe(6);
  });

  it("falls back to the default episode runtime when no episode event carries a duration", () => {
    const tracked = [trackedSeries({ totalEpisodes: 10, watchedEpisodes: 8 })]; // 2 left
    const events = [episodeEvent({ watchedAt: now.toISOString(), durationMinutes: null })];

    const forecast = computeForecast(tracked, events, now);

    // FALLBACK_EPISODE_MINUTES = 40
    expect(forecast.backlogMinutes).toBe(80);
  });

  it("averages the viewer's own recorded episode runtimes instead of the fallback", () => {
    const tracked = [trackedSeries({ totalEpisodes: 10, watchedEpisodes: 8 })]; // 2 left
    const events = [
      episodeEvent({ watchedAt: now.toISOString(), durationMinutes: 20 }),
      episodeEvent({ watchedAt: now.toISOString(), durationMinutes: 30 }),
    ];

    const forecast = computeForecast(tracked, events, now);

    // average = 25 minutes/episode * 2 backlog episodes
    expect(forecast.backlogMinutes).toBe(50);
  });

  it("ignores movie events, unwatched rollbacks, and durations that aren't positive numbers when averaging", () => {
    const tracked = [trackedSeries({ totalEpisodes: 10, watchedEpisodes: 9 })]; // 1 left
    const events = [
      event({ mediaType: "movie", watchedAt: now.toISOString(), durationMinutes: 200 }), // not an episode
      episodeEvent({ eventType: "unwatched", watchedAt: now.toISOString(), durationMinutes: 15 }),
      episodeEvent({ watchedAt: now.toISOString(), durationMinutes: 0 }), // not a usable runtime
      episodeEvent({ watchedAt: now.toISOString(), durationMinutes: 60 }),
    ];

    const forecast = computeForecast(tracked, events, now);

    expect(forecast.backlogMinutes).toBe(60);
  });

  it("counts rewatched episodes toward pace, and computes episodes-per-week over the last 60 days", () => {
    const tracked = [trackedSeries({ totalEpisodes: 100, watchedEpisodes: 30 })]; // 70 left
    // 14 episodes across the last 60 days -> 14 / (60/7) = 1.633... -> rounds to 1.6/week
    const events = Array.from({ length: 14 }, () =>
      episodeEvent({ eventType: "rewatched", watchedAt: now.toISOString() })
    );

    const forecast = computeForecast(tracked, events, now);

    expect(forecast.episodesPerWeek).toBe(1.6);
  });

  it("excludes episode events older than the 60-day pace window", () => {
    const tracked = [trackedSeries({ totalEpisodes: 10, watchedEpisodes: 5 })];
    const old = new Date(now);
    old.setDate(old.getDate() - 61);
    const events = [episodeEvent({ watchedAt: old.toISOString() })];

    const forecast = computeForecast(tracked, events, now);

    expect(forecast.episodesPerWeek).toBe(0);
    // No pace to project from, even though there's a backlog.
    expect(forecast.catchUpDate).toBeNull();
  });

  it("projects a catch-up date from backlog and recent pace, and omits it once there is no backlog", () => {
    const tracked = [trackedSeries({ totalEpisodes: 10, watchedEpisodes: 8 })]; // 2 left
    const events = [episodeEvent({ watchedAt: now.toISOString() })]; // 1 / (60/7) week pace

    const withBacklog = computeForecast(tracked, events, now);
    expect(withBacklog.catchUpDate).not.toBeNull();
    expect(new Date(withBacklog.catchUpDate!).getTime()).toBeGreaterThan(now.getTime());

    const caughtUp = computeForecast([trackedSeries({ totalEpisodes: 5, watchedEpisodes: 5 })], events, now);
    expect(caughtUp.catchUpDate).toBeNull();
  });
});

// The year-range scoping itself (rangeStart/rangeEnd filtering) happens in
// Rust and is exercised there (see list_viewing_events_for_year's own tests
// in src-tauri/src/stats/) — listViewingEventsForYear's mock below only ever
// returns events already scoped to the requested year, matching what Rust
// actually hands back. This test is only about the title/genre ranking done
// in TS on top of that.
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
});
