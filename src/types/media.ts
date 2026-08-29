export type MediaType = "movie" | "series";
export type SearchScope = "all" | MediaType;
export type LibraryStatus = "planned" | "watching" | "paused" | "completed" | "dropped";
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

// A crew credit — currently only ever populated with "Director" jobs (see
// mapCrew in api/mapper.ts), which is all the people-based discovery and
// collection features need for v1. Kept as its own shape (rather than
// reusing CastMember, which carries a "character" field crew members don't
// have) since TMDB's own credits response distinguishes cast from crew too.
export interface CrewMember {
  id: number;
  name: string;
  job?: string;
  profilePath?: string | null;
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
  // Optional (unlike `cast`, which every existing MediaSummary literal in
  // the codebase already sets) so this addition doesn't force every one of
  // those pre-existing literals — test fixtures, design-system sample
  // data, etc. — to be updated just to keep typechecking. Consumers that
  // care (people-you-watch.ts) treat a missing value the same as `[]`.
  /** Directors from this title's credits (job === "Director"). Undefined/empty unless fetched via a detail endpoint that appends credits. */
  directors?: CrewMember[];
}

// The TMDB collection a movie belongs to, as embedded in `/movie/{id}`'s
// `belongs_to_collection` field — just enough to link to and render the
// full collection (fetched separately via MediaProvider.getCollection).
export interface CollectionSummary {
  id: number;
  name: string;
  posterPath?: string | null;
  backdropPath?: string | null;
}

export interface Movie extends MediaSummary {
  mediaType: "movie";
  duration?: number | null;
  /** The franchise/collection this movie belongs to on TMDB, or null/undefined if it isn't part of one. */
  collection?: CollectionSummary | null;
}

// The full `/collection/{id}` response: a franchise's movies ("parts"),
// each mapped the same way any other movie summary is. Parts never carry
// credits (TMDB's collection endpoint doesn't return them), so their
// `cast`/`directors` are always empty — collection-progress.ts only needs
// id/mediaType/status from each part, never credits.
export interface MovieCollection {
  id: number;
  name: string;
  overview: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  parts: Movie[];
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
  note?: string | null;
}

// One viewing_events row for a single title, as returned by
// list_viewing_events_for_media (src-tauri/src/commands/stats.rs) — a
// title-scoped read of "what did I write, each time I watched this",
// distinct from ViewingEvent above which is used for cross-title stats
// aggregation and always carries profileId/mediaId/mediaType/title (already
// known by the caller here, so they're omitted).
export interface ViewingEventNote {
  id: string;
  eventType: "watched" | "unwatched" | "rewatched";
  watchedAt: string;
  episodeId?: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  note?: string;
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
  // True once every currently-aired episode is watched but the show still
  // has unaired/unannounced episodes ahead — distinct from `completed`
  // (which for an ongoing show basically never becomes true, since it also
  // requires future episodes TMDB has announced). Mutually exclusive with a
  // pending next episode: see getNextEpisode/calculateSeriesProgress.
  isUpToDate: boolean;
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
  /** Absolute path to a user-chosen backup folder, or null to use the default app-data location. */
  backupDirectory: string | null;
  /** Persistent "Hide watched" toggle for Discover-style surfaces (home catalogue rails) and Watch Tonight. */
  hideWatchedInDiscovery: boolean;
  /** Opt-in "On this day" Home card surfacing past-year viewing history matching today's date. Defaults to false — see the doc comment on the Rust struct's field for why it stays off until deliberately enabled. */
  onThisDayEnabled: boolean;
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

// "any" means "don't filter on this dimension at all" — every rule field
// has an explicit not-set value rather than treating an absent/undefined
// key as "any", so a saved smart list always round-trips through
// create/update with the exact same shape.
export type SmartListMediaTypeFilter = MediaType | "any";

// "mine" resolves to the profile's `preferredProviderIds` preference at
// evaluation time (see watch-tonight-page.tsx's identical MY_SERVICES_VALUE
// idea) — a specific TMDB provider id is stored as a number.
export type SmartListProviderFilter = "any" | "mine" | number;

// The fixed rule shape a smart list evaluates — deliberately AND-only, no
// nested groups: matches every README example ("Unwatched + Horror + under
// 100 min", "My Services + rating >= 8", "Series with episodes waiting")
// without needing a generic rule engine. Rust never inspects this shape (see
// src-tauri/src/lists/smart/'s doc comment) — it's stored and
// round-tripped as opaque JSON, and evaluated entirely client-side (see
// src/features/library/smart-list-evaluation.ts).
export interface SmartListRules {
  status: LibraryStatus | "any";
  mediaType: SmartListMediaTypeFilter;
  /** Canonical English genre label (MergedGenre.label from use-merged-genres.ts, e.g. "Horror") — matches library_items.genres, which are always stored in that canonical form. `null` = any genre. */
  genre: string | null;
  /** Movies only — a series has no single well-defined runtime, so this never excludes series (see smart-list-evaluation.ts). */
  maxRuntimeMinutes: number | null;
  minRating: number | null;
  provider: SmartListProviderFilter;
  /** Series only — "at least one episode not yet watched, per local progress" (see smart-list-evaluation.ts). Always false for movies. */
  hasEpisodeWaiting: boolean;
}

export interface SmartList {
  id: string;
  profileId: string;
  name: string;
  rules: SmartListRules;
  createdAt: string;
  updatedAt: string;
}

// Which page a saved filter belongs to — the two pages' filter-state shapes
// below are unrelated, so a Library-saved filter must never show up in
// Search's own saved-filters list or vice versa. Kept in sync with
// `VALID_PAGES` in src-tauri/src/lists/saved_filters/.
export type SavedFilterPage = "library" | "search";

// LibraryExplorer's own filter-control state (src/components/media/library-explorer.tsx),
// captured verbatim — reopening a saved filter is just "set the page's state
// back to this object," entirely client-side (see
// src/features/saved-filters/saved-filter-repository.ts's doc comment).
export interface LibraryFilterState {
  typeFilter: "all" | MediaType;
  statusFilter: LibraryStatus | "all";
  favouritesOnly: boolean;
  listFilter: string;
  sort: "recent" | "title" | "rating";
  search: string;
}

// SearchPage's own filter-control state (src/pages/search-page.tsx) — a
// different shape from LibraryFilterState since Search's own filters
// (scope/genre/provider) are unrelated to Library's (status/list/sort).
export interface SearchFilterState {
  scope: SearchScope;
  genreMovie?: string;
  genreSeries?: string;
  provider?: string;
}

export type SavedFilterState = LibraryFilterState | SearchFilterState;

export interface SavedFilter<TState extends SavedFilterState = SavedFilterState> {
  id: string;
  profileId: string;
  page: SavedFilterPage;
  name: string;
  filters: TState;
  createdAt: string;
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

// A recap for one calendar month is a historical breakdown (like Wrapped or
// monthlyActivity above) rather than a current-state total — it counts every
// watched/rewatched event that fell in the month, even one later unwatched.
export interface MonthlyRecap {
  month: string;
  moviesWatched: number;
  episodesWatched: number;
  minutesWatched: number;
  topRatedTitle: { title: string; rating: number } | null;
  favouriteGenre: string | null;
  biggestBingeDay: { day: string; count: number } | null;
}

export interface RewatchStats {
  // A rewatch is itself a historical action, not a reversible state like
  // "watched" — a raw count of every `rewatched` event ever logged, not
  // deduped to "the latest event per title" the way LibraryStats' totals are.
  totalRewatches: number;
  rewatchSharePercent: number;
  favouriteComfortTitles: Array<{ title: string; count: number }>;
  rewatchActivity: Array<{ month: string; count: number; minutes: number }>;
}

export interface RatingDistribution {
  // Current-state: library_items.user_rating is a single mutable value with
  // no change history, so a changed rating is reflected immediately here.
  distribution: Array<{ rating: number; count: number }>;
  averageByMonth: Array<{ period: string; average: number; count: number }>;
  averageByYear: Array<{ period: string; average: number; count: number }>;
}

export type MilestoneCategory = "episodes" | "movies" | "hours" | "series";

export interface WatchMilestone {
  id: string;
  category: MilestoneCategory;
  threshold: number;
  currentValue: number;
  achieved: boolean;
  achievedAt: string | null;
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
