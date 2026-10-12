import { defineCommand } from "@/shared/lib/invoke";
import type {
  Episode,
  EpisodeProgress,
  HistoryAction,
  MediaSummary,
  MediaType,
  TrackedSeriesItem,
  ViewingEventNote,
} from "@/types/media";

export type SeriesInput = MediaSummary & { numberOfEpisodes?: number };

export interface EpisodeHistoryInput {
  action: HistoryAction;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

type MovieIdArgs = {
  movieId: number;
};

type ToggleMovieSeenArgs = {
  movie: MediaSummary;
  watched: boolean;
  watchedAt: string;
  note: string | null;
};

type RewatchMovieArgs = {
  movie: MediaSummary;
  watchedAt: string;
  note: string | null;
};

type SeriesIdArgs = {
  seriesId: number;
};

type MovieIdsArgs = {
  movieIds: number[];
};

type SeriesIdsArgs = {
  seriesIds: number[];
};

export interface TrackedSeriesStatusRefresh {
  seriesId: number;
  status: string | null;
  totalEpisodes: number | null;
}

type ToggleEpisodesWatchedArgs = {
  series: SeriesInput;
  episodes: Episode[];
  watched: boolean;
  watchedAt: string;
  history: EpisodeHistoryInput | null;
  note: string | null;
};

type RefreshTrackedSeriesStatusArgs = SeriesIdArgs & {
  status: string | null;
  totalEpisodes: number | null;
};

type SetEpisodeRatingArgs = SeriesIdArgs & {
  episodeId: number;
  rating: number | null;
};

type ViewingEventsForMediaArgs = {
  mediaId: number;
  mediaType: MediaType;
};

export const progressCommands = {
  isMovieSeen: defineCommand<MovieIdArgs, boolean>("is_movie_seen"),
  seenMovieIds: defineCommand<MovieIdsArgs, number[]>("list_seen_movie_ids"),
  toggleMovieSeen: defineCommand<ToggleMovieSeenArgs, void>("toggle_movie_seen"),
  rewatchMovie: defineCommand<RewatchMovieArgs, void>("rewatch_movie"),
  getEpisodeProgress: defineCommand<SeriesIdArgs, EpisodeProgress[]>("get_episode_progress"),
  getEpisodeProgressBatch: defineCommand<SeriesIdsArgs, EpisodeProgress[]>("get_episode_progress_batch"),
  toggleEpisodesWatched: defineCommand<ToggleEpisodesWatchedArgs, number>("toggle_episodes_watched"),
  listTrackedSeries: defineCommand<undefined, TrackedSeriesItem[]>("list_tracked_series"),
  refreshTrackedSeriesStatus: defineCommand<RefreshTrackedSeriesStatusArgs, void>("refresh_tracked_series_status"),
  refreshTrackedSeriesStatuses: defineCommand<{ refreshes: TrackedSeriesStatusRefresh[] }, number[]>(
    "refresh_tracked_series_statuses"
  ),
  setEpisodeRating: defineCommand<SetEpisodeRatingArgs, void>("set_episode_rating"),
  listViewingEventsForMedia: defineCommand<ViewingEventsForMediaArgs, ViewingEventNote[]>(
    "list_viewing_events_for_media"
  ),
} as const;
