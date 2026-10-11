import { describe, expect, it } from "vitest";
import { BACKLOG_THRESHOLD, selectBacklogSeries } from "../select-backlog-series";
import type { NextEpisodeResult } from "@/features/progress/use-watch-next";
import type { Episode, TrackedSeriesItem } from "@/types/media";

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

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return { id: 900, seasonNumber: 1, episodeNumber: 1, title: "Episode", overview: "", ...overrides };
}

function makeResult(
  series: TrackedSeriesItem,
  nextEpisode: Episode | null,
  remaining = Math.max(0, series.totalEpisodes - series.watchedEpisodes)
): NextEpisodeResult {
  return { series, nextEpisode, remaining, isLoading: false, isError: false };
}

describe("selectBacklogSeries", () => {
  it("keeps only series with at least BACKLOG_THRESHOLD unwatched aired episodes that still have one resolved", () => {
    const belowThreshold = makeSeries({ seriesId: 1, watchedEpisodes: 10 - (BACKLOG_THRESHOLD - 1) });
    const atThreshold = makeSeries({ seriesId: 2, watchedEpisodes: 10 - BACKLOG_THRESHOLD });
    const results = [makeResult(belowThreshold, makeEpisode()), makeResult(atThreshold, makeEpisode())];

    expect(selectBacklogSeries([belowThreshold, atThreshold], results)).toEqual([
      { series: atThreshold, remaining: BACKLOG_THRESHOLD },
    ]);
  });

  it("counts what has aired, not the cached total: TMDB announcing a season does not make a backlog", () => {
    // Cached total 14, watched 10 — but only one episode is out.
    const justOneOut = makeSeries({ seriesId: 4, totalEpisodes: 14, watchedEpisodes: 10 });
    const results = [makeResult(justOneOut, makeEpisode(), 1)];

    expect(selectBacklogSeries([justOneOut], results)).toEqual([]);
  });

  it("excludes a series past the threshold once its resolved next episode is null (nothing aired-and-unwatched left, just TMDB's total outrunning what's aired)", () => {
    const caughtUp = makeSeries({ seriesId: 3, totalEpisodes: 20, watchedEpisodes: 10 });
    const results = [makeResult(caughtUp, null)];

    expect(selectBacklogSeries([caughtUp], results)).toEqual([]);
  });
});
