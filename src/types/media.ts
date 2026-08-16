export type MediaType = "movie" | "series";
export type SearchScope = "all" | MediaType;
export type LibraryStatus = "planned" | "watching" | "paused" | "completed" | "dropped" | "rewatching";
export type HistoryAction =
  | "movie:watched"
  | "movie:unwatched"
  | "episode:watched"
  | "episode:unwatched"
  | "season:watched"
  | "season:unwatched"
  | "series:watched"
  | "series:unwatched"
  | "watchlist:add"
  | "watchlist:remove"
  | "library:update"
  | "list:add"
  | "list:remove";

export interface PageResult<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

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
  genreIds?: number[];
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

export interface LibraryItem {
  id: string;
  profileId: string;
  mediaId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  year?: number | null;
  rating?: number | null;
  createdAt: string;
  updatedAt: string;
  genres: string[];
  status: LibraryStatus;
  favourite: boolean;
  userRating?: number | null;
  notes?: string | null;
  tags: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  rewatchCount: number;
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
  metadata?: Record<string, unknown>;
}

export interface ViewingEvent {
  id: string;
  profileId: string;
  mediaId: number;
  mediaType: MediaType;
  title: string;
  eventType: "watched" | "unwatched" | "rewatched";
  watchedAt: string;
  durationMinutes?: number | null;
  episodeId?: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export interface EpisodeProgress {
  id: string;
  profileId?: string;
  seriesId: number;
  episodeId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
  watchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
  id: string;
  name: string | null;
  avatar?: string | null;
  createdAt?: string;
  supabaseUserId?: string | null;
}

export interface UserPreferences {
  theme: "dark" | "light";
  accentColor: "violet" | "blue" | "teal" | "green" | "amber" | "orange" | "rose" | "red";
  language: "en" | "fr";
  region: string;
  defaultSearchType: SearchScope;
  reduceMotion: boolean;
  compactMode: boolean;
  sidebarCollapsed: boolean;
  libraryViewMode: "grid" | "list";
  spoilerProtection: boolean;
  notificationsEnabled: boolean;
  notifyHoursBefore: number;
  preferredProviderIds: number[];
  activeProfileId: string;
  userProfile: UserProfile;
}

export interface TrackedSeriesItem {
  id: string;
  profileId?: string;
  seriesId: number;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  totalEpisodes: number;
  watchedEpisodes: number;
  /** TMDB's own production status ("Returning Series", "Ended", …) — null/undefined means unknown (rows from before this existed, or a TV Time import), never treated as "ended". */
  status?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomList {
  id: string;
  profileId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomListItem {
  id: string;
  listId: string;
  mediaId: number;
  mediaType: MediaType;
  title: string;
  posterPath?: string | null;
  position: number;
  addedAt: string;
  updatedAt: string;
}

export interface WatchProvider {
  id: number;
  name: string;
  logoPath?: string | null;
  displayPriority?: number;
}

export interface WatchProviderAvailability {
  region: string;
  link?: string;
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  free: WatchProvider[];
}

export interface MediaVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface PersonSummary {
  id: number;
  name: string;
  profilePath?: string | null;
  knownForDepartment?: string;
  knownFor: MediaSummary[];
}

export interface CalendarEntry {
  id: string;
  mediaId: number;
  mediaType: MediaType;
  title: string;
  date: string;
  kind: "movie-release" | "episode";
  posterPath?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface AvailabilitySnapshot {
  mediaId: number;
  mediaType: MediaType;
  region: string;
  providerIds: number[];
  checkedAt: string;
}

export interface AvailabilityAlert {
  id: string;
  profileId: string;
  mediaId: number;
  mediaType: MediaType;
  title: string;
  region: string;
  providerIds: number[];
  enabled: boolean;
  createdAt: string;
}

// The Calendar and Alerts pages merged into one "Suivi"/"Tracking" feed
// (see src/features/tracking/tracking-service.ts): a release date and a
// provider-availability change are both just conditions on a title the user
// is watching for. "scope" separates a title the user actually tracks
// (library entry, tracked series, or an alert they created) from
// "discovery" — a global upcoming-movie result the user never opted into
// and that must never trigger a notification on its own.
export type TrackingEntryType = "release" | "episode" | "availability";
export type TrackingScope = "mine" | "discovery";

export interface TrackingEntry {
  id: string;
  mediaId: number;
  mediaType: MediaType;
  title: string;
  type: TrackingEntryType;
  scope: TrackingScope;
  posterPath?: string | null;
  // ISO date for "release"/"episode" entries; null for "availability"
  // entries, which fire on a state change rather than a fixed date.
  date: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  // "availability" entries only.
  available?: boolean;
  providerIds?: number[];
  region?: string;
  alertId?: string;
}

export interface LibraryStats {
  moviesWatched: number;
  episodesWatched: number;
  minutesWatched: number;
  movieMinutesWatched: number;
  episodeMinutesWatched: number;
  completedSeries: number;
  averageUserRating: number | null;
  favouriteGenres: Array<{ name: string; count: number }>;
  favouriteGenreByRating: string | null;
  mostRewatchedTitle: { title: string; count: number } | null;
  monthlyActivity: Array<{ month: string; count: number; minutes: number }>;
  currentStreakDays: number;
  longestStreakDays: number;
  biggestBingeDay: { day: string; count: number } | null;
  libraryCompletionPercent: number;
  heatmap: Array<{ day: number; hour: number; count: number }>;
}

export interface HomeFeed {
  trendingSeries: Series[];
  topRatedSeries: Series[];
  onTheAirSeries: Series[];
  trendingMovies: Movie[];
  topRatedMovies: Movie[];
  nowPlayingMovies: Movie[];
  upcomingMovies: Movie[];
}
