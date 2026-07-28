import { beforeEach, describe, expect, it } from "vitest";
import { statsRepository } from "../stats-repository";
import { browserStore } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
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
  it("aggregates watched minutes and genres", () => {
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
    const events = [
      {
        id: "1",
        profileId: "default",
        mediaId: 1,
        mediaType: "movie",
        title: "Test",
        eventType: "watched",
        watchedAt: new Date().toISOString(),
        durationMinutes: 120,
      },
    ] as ViewingEvent[];
    const stats = statsRepository._compute(library, events);
    expect(stats.moviesWatched).toBe(1);
    expect(stats.minutesWatched).toBe(120);
    expect(stats.favouriteGenres[0]).toEqual({ name: "Drama", count: 1 });
  });

  it("computes averages, completion percent and completed series", () => {
    const library = [
      libraryItem({ mediaId: 1, userRating: 8, status: "completed" }),
      libraryItem({ mediaId: 2, userRating: 6, status: "planned" }),
      libraryItem({ mediaId: 3, mediaType: "series", status: "completed" }),
      libraryItem({ mediaId: 4, mediaType: "series", status: "watching" }),
    ];

    const stats = statsRepository._compute(library, []);

    expect(stats.averageUserRating).toBe(7);
    expect(stats.completedSeries).toBe(1);
    expect(stats.watchlistCompletionPercent).toBe(50);
  });

  it("counts a streak of consecutive watching days and breaks it on a gap", () => {
    const consecutive = [
      event({ watchedAt: isoDaysAgo(0) }),
      event({ watchedAt: isoDaysAgo(1) }),
      event({ watchedAt: isoDaysAgo(2) }),
    ];
    expect(statsRepository._compute([], consecutive).currentStreakDays).toBe(3);

    const withGap = [event({ watchedAt: isoDaysAgo(0) }), event({ watchedAt: isoDaysAgo(2) })];
    expect(statsRepository._compute([], withGap).currentStreakDays).toBe(1);

    expect(statsRepository._compute([], []).currentStreakDays).toBe(0);
  });

  it("ignores unwatched events everywhere", () => {
    const events = [event({ eventType: "unwatched" })];
    const stats = statsRepository._compute([], events);

    expect(stats.moviesWatched).toBe(0);
    expect(stats.minutesWatched).toBe(0);
    expect(stats.currentStreakDays).toBe(0);
  });

  describe("getYearSummary (browser fallback)", () => {
    beforeEach(() => {
      window.localStorage.clear();
      preferencesRepository.invalidate();
    });

    it("aggregates the selected year only, with top titles and favourite genre", async () => {
      const year = new Date().getFullYear();
      const store = browserStore.read();
      store.library = [libraryItem({ mediaId: 1, genres: ["Drame"] })];
      store.viewingEvents = [
        event({ mediaId: 1, title: "Film A", watchedAt: `${year}-02-01T00:00:00.000Z`, durationMinutes: 100 }),
        event({ mediaId: 1, title: "Film A", watchedAt: `${year}-03-01T00:00:00.000Z`, durationMinutes: 50 }),
        event({ mediaId: 2, title: "Hors année", watchedAt: `${year - 1}-03-01T00:00:00.000Z` }),
      ];
      browserStore.write(store);

      const summary = await statsRepository.getYearSummary(year);

      expect(summary.movies).toBe(2);
      expect(summary.minutes).toBe(150);
      expect(summary.activeDays).toBe(2);
      expect(summary.topTitles[0]).toEqual({ title: "Film A", count: 2 });
      expect(summary.favouriteGenre).toBe("Drame");
    });
  });
});
