// Generated straight from the matching Rust DTO (see docs/architecture.md's
// IPC boundary section) rather than hand-mirrored here — regenerate via
// `cargo test` in src-tauri, never edit src/generated/dto/*.ts by hand.
// Imported (not just re-exported) since other types below still reference
// these by name.
import type { MediaType } from "@/generated/dto/MediaType";
import type { SearchScope } from "@/generated/dto/SearchScope";
import type { LibraryStatus } from "@/generated/dto/LibraryStatus";
import type { LibrarySort } from "@/generated/dto/LibrarySort";

export type { MediaType } from "@/generated/dto/MediaType";
export type { SearchScope } from "@/generated/dto/SearchScope";
export type { LibraryStatus } from "@/generated/dto/LibraryStatus";
export type { HistoryAction } from "@/generated/dto/HistoryAction";
export type { Theme } from "@/generated/dto/Theme";
export type { Language } from "@/generated/dto/Language";
export type { LibraryViewMode } from "@/generated/dto/LibraryViewMode";

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

export type { LibraryItem } from "@/generated/dto/LibraryItem";
export type { LibraryPage } from "@/generated/dto/LibraryPage";
export type { LibraryListParams } from "@/generated/dto/LibraryListParams";
export type { LibrarySort };
export type { LibraryMediaKey } from "@/generated/dto/LibraryMediaKey";
export type { LibraryStatusCounts } from "@/generated/dto/LibraryStatusCounts";
export type { LibraryFilterParams } from "@/generated/dto/LibraryFilterParams";
export type { ViewingHistoryItem } from "@/generated/dto/ViewingHistoryItem";
export type { ViewingEvent } from "@/generated/dto/ViewingEvent";
export type { ViewingEventType } from "@/generated/dto/ViewingEventType";
export type { ViewingEventNote } from "@/generated/dto/ViewingEventNote";
export type { EpisodeProgress } from "@/generated/dto/EpisodeProgress";
export type { TrackedSeriesItem } from "@/generated/dto/TrackedSeriesItem";

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

// Not UserProfile above: that hand-written interface is a loose superset
// covering both this DTO's own minimal nested profile shape (id/name/avatar
// only — src-tauri/src/preferences/models.rs) AND the richer, separate
// profiles::models::UserProfile (id/name/avatar/createdAt/supabaseUserId) —
// two distinct Rust structs sharing one frontend name. The generated
// UserPreferences type below references the correct (minimal) one
// internally; re-exporting that same generated file as `UserProfile` here
// would silently drop the fields the richer profiles-domain usages need.
export type { UserPreferences } from "@/generated/dto/UserPreferences";
export type { CustomList } from "@/generated/dto/CustomList";
export type { CustomListItem } from "@/generated/dto/CustomListItem";

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
  sort: LibrarySort;
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

export type { AvailabilitySnapshot } from "@/generated/dto/AvailabilitySnapshot";
export type { AvailabilityAlert } from "@/generated/dto/AvailabilityAlert";

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

export type { MonthlyRecap } from "@/generated/dto/MonthlyRecap";
export type { RewatchStats } from "@/generated/dto/RewatchStats";
export type { RatingDistribution } from "@/generated/dto/RatingDistribution";
export type { MilestoneCategory } from "@/generated/dto/MilestoneCategory";
export type { WatchMilestone } from "@/generated/dto/WatchMilestone";
export type { StatsOverview } from "@/generated/dto/StatsOverview";
export type { YearlyActivityBucket } from "@/generated/dto/YearlyActivityBucket";
export type { ActivityStats } from "@/generated/dto/ActivityStats";
export type { HeatmapBucket } from "@/generated/dto/HeatmapBucket";
export type { LibraryExtras } from "@/generated/dto/LibraryExtras";
export type { FavouriteGenre } from "@/generated/dto/FavouriteGenre";
export type { RewatchedTitle } from "@/generated/dto/RewatchedTitle";
export type { WatchForecast } from "@/generated/dto/WatchForecast";

export interface HomeFeed {
  trendingSeries: Series[];
  topRatedSeries: Series[];
  onTheAirSeries: Series[];
  trendingMovies: Movie[];
  topRatedMovies: Movie[];
  nowPlayingMovies: Movie[];
  upcomingMovies: Movie[];
}
