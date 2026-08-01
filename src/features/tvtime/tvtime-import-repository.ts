import { invokeCommand } from "@/shared/lib/invoke";
import type { Series } from "@/types/media";

export interface ImportableEpisode {
  episodeId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
  runtimeMinutes: number | null;
}

export interface ImportableMovie {
  movieId: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  runtime?: number | null;
  watchedAt: string;
}

// The batch upsert/rollup logic (reusing the same Rust code as the
// interactive progress toggles) now lives in Rust (see
// src-tauri/src/commands/tvtime.rs) — this repository is a thin invoke()
// wrapper. Active-profile resolution moved there too, so callers no longer
// pass a profile explicitly.
export const tvTimeImportRepository = {
  async importSeriesProgress(series: Series, episodes: ImportableEpisode[]): Promise<number> {
    return invokeCommand<number>("import_series_progress", { series, episodes });
  },

  async importMovieSeen(movie: ImportableMovie): Promise<boolean> {
    return invokeCommand<boolean>("import_movie_seen", { movie });
  },
};
