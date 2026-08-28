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

type SeriesIdArgs = {
  seriesId: number;
};

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
};

type ViewingEventsForMediaArgs = {
  mediaId: number;
  mediaType: MediaType;
};

export const progressCommands = {
  isMovieSeen: defineCommand<MovieIdArgs, boolean>("is_movie_seen"),
  toggleMovieSeen: defineCommand<ToggleMovieSeenArgs, void>("toggle_movie_seen"),
  getEpisodeProgress: defineCommand<SeriesIdArgs, EpisodeProgress[]>("get_episode_progress"),
  toggleEpisodesWatched: defineCommand<ToggleEpisodesWatchedArgs, number>("toggle_episodes_watched"),
  listTrackedSeries: defineCommand<undefined, TrackedSeriesItem[]>("list_tracked_series"),
  refreshTrackedSeriesStatus: defineCommand<RefreshTrackedSeriesStatusArgs, void>("refresh_tracked_series_status"),
  listViewingEventsForMedia: defineCommand<ViewingEventsForMediaArgs, ViewingEventNote[]>(
    "list_viewing_events_for_media"
  ),
} as const;
