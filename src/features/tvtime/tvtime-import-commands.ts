import { defineCommand } from "@/shared/lib/invoke";
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
  year?: number | null;
  rating?: number | null;
  genres?: string[];
}

type ImportSeriesProgressArgs = {
  series: Series;
  episodes: ImportableEpisode[];
};

type ImportMovieSeenArgs = {
  movie: ImportableMovie;
};

export const tvTimeImportCommands = {
  importSeriesProgress: defineCommand<ImportSeriesProgressArgs, number>("import_series_progress"),
  importMovieSeen: defineCommand<ImportMovieSeenArgs, boolean>("import_movie_seen"),
} as const;
