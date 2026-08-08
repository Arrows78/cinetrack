import { describe, expect, it, vi } from "vitest";
import { statsRepository } from "../stats-repository";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";
import { makeMedia } from "@/shared/test-utils";
import type { LibraryItem, ViewingEvent } from "@/types/media";

const libraryItem = (overrides: Partial<LibraryItem> = {}): LibraryItem =>
  ({
    profileId: "default",
    mediaId: 1,
    mediaType: "movie",
    title: "Test",
    genres: [],
    status: "completed",
    favourite: false,
    tags: [],
    rewatchCount: 0,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  }) as LibraryItem;

const event = (overrides: Partial<ViewingEvent> = {}): ViewingEvent =>
  ({
    id: crypto.randomUUID(),
    profileId: "default",
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

describe("statsRepository", () => {
  // Totals (movies/episodes/minutes watched, completed series, watchlist
  // completion) and monthly activity are now aggregated in SQL — see
  // src-tauri/src/commands/stats.rs's own test suite for their coverage.
  // What's left as pure, unit-testable TS is genre/rating extraction from
  // the (much smaller) library table, and the streak walk over events.
  it("extracts favourite genres from the library", () => {
    const library = [
      {
        profileId: "default",
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

    expect(statsRepository._libraryExtras(library).favouriteGenres[0]).toEqual({ name: "Drama", count: 1 });
  });

  it("computes the average user rating across rated items", () => {
    const library = [
      libraryItem({ mediaId: 1, userRating: 8, status: "completed" }),
      libraryItem({ mediaId: 2, userRating: 6, status: "planned" }),
      libraryItem({ mediaId: 3, mediaType: "series", status: "completed", userRating: null }),
    ];

    expect(statsRepository._libraryExtras(library).averageUserRating).toBe(7);
    expect(statsRepository._libraryExtras([]).averageUserRating).toBeNull();
  });

  it("counts a streak of consecutive watching days and breaks it on a gap", () => {
    const consecutive = [
      event({ watchedAt: isoDaysAgo(0) }),
      event({ watchedAt: isoDaysAgo(1) }),
      event({ watchedAt: isoDaysAgo(2) }),
    ];
    expect(statsRepository._currentStreak(consecutive)).toBe(3);

    const withGap = [event({ watchedAt: isoDaysAgo(0) }), event({ watchedAt: isoDaysAgo(2) })];
    expect(statsRepository._currentStreak(withGap)).toBe(1);

    expect(statsRepository._currentStreak([])).toBe(0);
  });

  it("ignores unwatched events in the streak", () => {
    expect(statsRepository._currentStreak([event({ eventType: "unwatched" })])).toBe(0);
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
