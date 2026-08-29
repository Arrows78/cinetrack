import { describe, expect, it } from "vitest";
import { computeForecast } from "../stats-repository";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { TrackedSeriesItem, ViewingEvent } from "@/types/media";

const tracked = (watched: number, total: number): TrackedSeriesItem => ({
  id: crypto.randomUUID(),
  profileId: DEFAULT_PROFILE_ID,
  seriesId: 1,
  title: "Test",
  posterPath: null,
  backdropPath: null,
  totalEpisodes: total,
  watchedEpisodes: watched,
  status: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const episodeEvent = (daysAgo: number, minutes = 50): ViewingEvent => ({
  id: crypto.randomUUID(),
  profileId: DEFAULT_PROFILE_ID,
  mediaId: 1,
  mediaType: "series",
  title: "Test",
  eventType: "watched",
  watchedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  durationMinutes: minutes,
  episodeId: 100 + daysAgo,
  seasonNumber: 1,
  episodeNumber: daysAgo,
});

describe("computeForecast", () => {
  it("projects the catch-up date from the recent pace", () => {
    const events = [episodeEvent(1), episodeEvent(3), episodeEvent(10), episodeEvent(20)];
    const forecast = computeForecast([tracked(4, 12)], events);

    expect(forecast.backlogEpisodes).toBe(8);
    expect(forecast.backlogMinutes).toBe(8 * 50);
    expect(forecast.episodesPerWeek).toBeCloseTo(4 / (60 / 7), 1);
    expect(forecast.catchUpDate).not.toBeNull();
    expect(new Date(forecast.catchUpDate!).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns no catch-up date without backlog or without pace", () => {
    expect(computeForecast([tracked(12, 12)], [episodeEvent(2)]).catchUpDate).toBeNull();
    expect(computeForecast([tracked(2, 12)], [episodeEvent(90)]).catchUpDate).toBeNull();
  });

  it("falls back to a default runtime when events carry none", () => {
    const event = { ...episodeEvent(5), durationMinutes: null };
    const forecast = computeForecast([tracked(0, 10)], [event]);
    expect(forecast.backlogMinutes).toBe(10 * 40);
  });
});
