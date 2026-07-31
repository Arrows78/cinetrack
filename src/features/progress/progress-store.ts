import type { Episode, EpisodeProgress, MediaSummary, TrackedSeriesItem } from "@/types/media";

export type SeriesInput = MediaSummary & { numberOfEpisodes?: number };

/**
 * Storage backend for watch progress. Two implementations exist:
 * SQL (Tauri desktop, see progress-store-sql.ts) and localStorage
 * (browser fallback, see progress-store-browser.ts). The repository
 * facade picks one per call based on database availability.
 */
export interface ProgressStore {
  isMovieSeen(profile: string, movieId: number): Promise<boolean>;
  /** Persists the seen flag and records the viewing event + history entry. */
  toggleMovieSeen(profile: string, movie: MediaSummary, watched: boolean, watchedAt: string): Promise<void>;
  getEpisodeProgress(profile: string, seriesId: number): Promise<EpisodeProgress[]>;
  /**
   * Applies a watched/unwatched change to a set of episodes, records the
   * matching viewing events, and refreshes the tracked-series rollup.
   * Returns the number of episodes whose state actually changed.
   */
  applyEpisodes(
    profile: string,
    series: SeriesInput,
    episodes: Episode[],
    watched: boolean,
    watchedAt: string
  ): Promise<number>;
  listTrackedSeries(profile: string): Promise<TrackedSeriesItem[]>;
}
