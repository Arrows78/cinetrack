import { z } from "zod";

// Structural validation for the portable backup format (see portable-data.ts).
// Every schema mirrors the real shape in src/types/media.ts exactly, so data
// exported by this app always round-trips; only genuinely malformed data
// (e.g. a hand-edited or corrupted backup file) gets rejected.

const mediaType = z.enum(["movie", "series"]);
const libraryStatus = z.enum(["planned", "watching", "paused", "completed", "dropped", "rewatching"]);
const historyAction = z.enum([
  "movie:watched",
  "movie:unwatched",
  "episode:watched",
  "episode:unwatched",
  "season:watched",
  "season:unwatched",
  "series:watched",
  "series:unwatched",
  "watchlist:add",
  "watchlist:remove",
  "library:update",
  "list:add",
  "list:remove",
]);

export const watchlistItemSchema = z.object({
  profileId: z.string().optional(),
  mediaId: z.number(),
  mediaType,
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  createdAt: z.string(),
});

export const seenMovieSchema = z.object({
  profileId: z.string().optional(),
  movieId: z.number(),
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  watchedAt: z.string(),
});

export const episodeProgressSchema = z.object({
  profileId: z.string().optional(),
  seriesId: z.number(),
  episodeId: z.number(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  watched: z.boolean(),
  watchedAt: z.string().nullable().optional(),
});

export const trackedSeriesItemSchema = z.object({
  profileId: z.string().optional(),
  seriesId: z.number(),
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  totalEpisodes: z.number(),
  watchedEpisodes: z.number(),
  updatedAt: z.string(),
});

export const viewingHistoryItemSchema = z.object({
  id: z.string(),
  mediaId: z.number(),
  mediaType,
  title: z.string(),
  action: historyAction,
  timestamp: z.string(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  episodeTitle: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const libraryItemSchema = z.object({
  profileId: z.string(),
  mediaId: z.number(),
  mediaType,
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  createdAt: z.string(),
  genres: z.array(z.string()),
  status: libraryStatus,
  favourite: z.boolean(),
  userRating: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  rewatchCount: z.number(),
  updatedAt: z.string(),
});

export const viewingEventSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  mediaId: z.number(),
  mediaType,
  title: z.string(),
  eventType: z.enum(["watched", "unwatched", "rewatched"]),
  watchedAt: z.string(),
  durationMinutes: z.number().nullable().optional(),
  episodeId: z.number().nullable().optional(),
  seasonNumber: z.number().nullable().optional(),
  episodeNumber: z.number().nullable().optional(),
});

export const userProfileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatar: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  supabaseUserId: z.string().nullable().optional(),
});

export const customListSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const customListItemSchema = z.object({
  listId: z.string(),
  mediaId: z.number(),
  mediaType,
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  position: z.number(),
  addedAt: z.string(),
});

export const availabilitySnapshotSchema = z.object({
  mediaId: z.number(),
  mediaType,
  region: z.string(),
  providerIds: z.array(z.number()),
  checkedAt: z.string(),
});

export const availabilityAlertSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  mediaId: z.number(),
  mediaType,
  title: z.string(),
  region: z.string(),
  providerIds: z.array(z.number()),
  enabled: z.boolean(),
  createdAt: z.string(),
});

// Generous upper bounds — far beyond anything a real single-user library
// would ever contain — so a corrupted or hostile payload can't force an
// unbounded insert loop against SQLite (each array is inserted row-by-row
// inside one transaction; see portable-data-import.ts).
export const MAX_LIST_ITEMS = 20_000;
export const MAX_EVENT_ITEMS = 200_000;
export const MAX_PROFILES = 50;
export const MAX_LISTS = 500;

export const portableDataSchema = z.object({
  watchlist: z.array(watchlistItemSchema).max(MAX_LIST_ITEMS).optional(),
  seenMovies: z.array(seenMovieSchema).max(MAX_LIST_ITEMS).optional(),
  episodeProgress: z.array(episodeProgressSchema).max(MAX_EVENT_ITEMS).optional(),
  trackedSeries: z.array(trackedSeriesItemSchema).max(MAX_LIST_ITEMS).optional(),
  history: z.array(viewingHistoryItemSchema).max(MAX_EVENT_ITEMS).optional(),
  // Loose here; preferences-repository parses this section with its own
  // strict schema on read, and backup-schema.ts overrides it with
  // preferencesSchema for backup validation.
  preferences: z.record(z.string(), z.unknown()).optional(),
  library: z.array(libraryItemSchema).max(MAX_LIST_ITEMS).optional(),
  viewingEvents: z.array(viewingEventSchema).max(MAX_EVENT_ITEMS).optional(),
  profiles: z.array(userProfileSchema).max(MAX_PROFILES).optional(),
  customLists: z.array(customListSchema).max(MAX_LISTS).optional(),
  customListItems: z.array(customListItemSchema).max(MAX_EVENT_ITEMS).optional(),
  availabilitySnapshots: z.array(availabilitySnapshotSchema).max(MAX_LIST_ITEMS).optional(),
  availabilityAlerts: z.array(availabilityAlertSchema).max(MAX_LIST_ITEMS).optional(),
});
