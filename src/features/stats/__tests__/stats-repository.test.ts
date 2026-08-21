// @vitest-environment node
//
// The second describe block below uses useTestSqlite() (see
// sqlite-test-harness.ts), which relies on the real node:sqlite built-in.
// Under the default jsdom environment, Vite treats this file as browser
// ("client") code and refuses to bundle a Node built-in into it — applies
// to the whole file since environment is a per-file pragma, but the first
// describe block's plain data assertions don't depend on jsdom either way.
import { describe, expect, it, vi } from "vitest";
import {
  biggestBingeDay,
  currentStreak,
  libraryExtras,
  longestStreak,
  monthOverMonthComparison,
  viewingHeatmap,
} from "../stats-repository";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";
import type { LibraryItem, ViewingEvent } from "@/types/media";

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

describe("statsRepository.getYearSummary (real SQLite path)", () => {
  vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
  vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
  vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
  useTestSqlite();

  it("aggregates the selected year only, with top titles and favourite genre", async () => {
    const { libraryRepository } = await import("../../library/library-repository");
    const { progressRepository } = await import("../../progress/progress-repository");
    const { statsRepository: repo } = await import("../stats-repository");
    const year = new Date().getFullYear();

    await libraryRepository.save(makeMedia({ id: 1, title: "Film A", genres: ["Drame"] }));

    await progressRepository.toggleMovieSeen(
      makeMedia({ id: 1, title: "Film A", runtime: 100 }),
      true,
      `${year}-02-01T00:00:00.000Z`
    );
    await progressRepository.toggleMovieSeen(
      makeMedia({ id: 1, title: "Film A", runtime: 50 }),
      true,
      `${year}-03-01T00:00:00.000Z`
    );
    await progressRepository.toggleMovieSeen(
      makeMedia({ id: 2, title: "Hors année" }),
      true,
      `${year - 1}-03-01T00:00:00.000Z`
    );

    const summary = await repo.getYearSummary(year);

    expect(summary.movies).toBe(2);
    expect(summary.minutes).toBe(150);
    expect(summary.activeDays).toBe(2);
    expect(summary.topTitles[0]).toEqual({ title: "Film A", count: 2 });
    expect(summary.favouriteGenre).toBe("Drame");
  });
});
