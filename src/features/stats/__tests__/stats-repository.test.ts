import { describe, expect, it } from "vitest";
import { statsRepository } from "../stats-repository";
import type { LibraryItem, ViewingEvent } from "@/types/media";

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
});
