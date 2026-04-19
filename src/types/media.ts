export type MediaType = "movie" | "series";
export type HistoryAction =
  | "movie:watched"
  | "movie:unwatched"
  | "episode:watched"
  | "episode:unwatched"
  | "watchlist:add"
  | "watchlist:remove";

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profilePath?: string | null;
  order?: number;
}

export interface MediaSummary {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  overview: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseDate?: string | null;
  year?: number | null;
  rating?: number | null;
  genres: string[];
  country?: string[];
  language?: string;
  status?: string;
  runtime?: number | null;
  cast: CastMember[];
}

export interface Movie extends MediaSummary {
  mediaType: "movie";
  duration?: number | null;
}

export interface Episode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string;
  airDate?: string | null;
  runtime?: number | null;
  stillPath?: string | null;
  rating?: number | null;
  watched?: boolean;
  watchedAt?: string | null;
}

export interface Season {
  id: number;
  seasonNumber: number;
  name: string;
  overview: string;
  posterPath?: string | null;
  airDate?: string | null;
  episodeCount: number;
  episodes: Episode[];
  watchedCount?: number;
  progressPercent?: number;
}

export interface Series extends MediaSummary {
  mediaType: "series";
  numberOfSeasons: number;
  numberOfEpisodes?: number;
  seasons: Season[];
}

export interface WatchlistItem {
  mediaId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  year?: number | null;
  rating?: number | null;
  createdAt: string;
}

export interface ViewingHistoryItem {
  id: string;
  mediaId: number;
  mediaType: MediaType;
  title: string;
  action: HistoryAction;
  timestamp: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface EpisodeProgress {
  seriesId: number;
  episodeId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
  watchedAt?: string | null;
}

export interface SeriesProgress {
  seriesId: number;
  totalEpisodes: number;
  watchedEpisodes: number;
  seasons: Array<{
    seasonNumber: number;
    totalEpisodes: number;
    watchedEpisodes: number;
    progressPercent: number;
  }>;
  progressPercent: number;
  completed: boolean;
}

export interface UserProfile {
  name: string | null;
}

export interface UserPreferences {
  theme: "dark" | "light";
  accentColor: "violet" | "blue" | "teal" | "green" | "amber" | "orange" | "rose" | "red";
  defaultSearchType: "all" | "movie" | "series";
  defaultWatchlistFilter: "all" | "movie" | "series";
  reduceMotion: boolean;
  compactMode: boolean;
  sidebarCollapsed: boolean;
  userProfile: UserProfile;
}

export interface TrackedSeriesItem {
  seriesId: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  totalEpisodes: number;
  watchedEpisodes: number;
  updatedAt: string;
}

export interface HomeFeed {
  // Series
  trendingSeries: Series[];
  topRatedSeries: Series[];
  onTheAirSeries: Series[];
  // Movies
  trendingMovies: Movie[];
  topRatedMovies: Movie[];
  nowPlayingMovies: Movie[];
  upcomingMovies: Movie[];
}
