import type { NextEpisodeResult } from "@/features/progress/use-watch-next";
import type { TrackedSeriesItem } from "@/types/media";

// A tracked series counts as "needs attention" once this many aired
// episodes are waiting — fewer than this is just ordinary progress (already
// covered by "Continuer à regarder"), not a pile-up worth flagging.
export const BACKLOG_THRESHOLD = 3;

export interface BacklogSeries {
  series: TrackedSeriesItem;
  remaining: number;
}

/**
 * Series with a real pile-up of aired-but-unwatched episodes.
 * `totalEpisodes - watchedEpisodes` alone isn't that: TMDB's total episode
 * count for an ongoing show routinely includes episodes of the current
 * season that haven't aired yet (see calculateSeriesProgress's isUpToDate,
 * which exists for exactly this reason), so a viewer fully caught up on
 * everything actually aired could still show a "backlog" of several unaired
 * episodes. `nextEpisodeResults` — the same per-series resolution Today
 * Hub's continue-watching/up-next/new-episodes cards already fetch, not an
 * extra request — tells us which series genuinely still have an aired,
 * unwatched episode; only those are eligible here.
 */
export function selectBacklogSeries(
  trackedSeries: TrackedSeriesItem[],
  nextEpisodeResults: NextEpisodeResult[]
): BacklogSeries[] {
  const resolved = new Map(
    nextEpisodeResults.filter((result) => result.nextEpisode !== null).map((result) => [result.series.seriesId, result])
  );
  return trackedSeries
    .flatMap((series) => {
      const result = resolved.get(series.seriesId);
      if (!result) return [];
      // `result.remaining` counts aired episodes when the resolution could
      // (see useNextEpisodes); the cached total is only the fallback.
      return [{ series, remaining: result.remaining }];
    })
    .filter(({ remaining }) => remaining >= BACKLOG_THRESHOLD);
}
