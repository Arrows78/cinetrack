import { z } from "zod";
import { preferencesSchema } from "@/features/preferences/preferences-repository";

// Field-level validation for a restored backup. Previously `normalizeData`
// only checked that each top-level field was an array/object — a backup
// with, say, `watchlist: [{ mediaId: "not-a-number" }]` would sail through
// and get written into SQLite as-is. Every field here mirrors the real
// shape in src/types/media.ts and src/db/browser-store.ts exactly, so a
// backup produced by this app's own export() continues to import
// identically; only genuinely malformed data gets rejected.

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

const watchlistItemSchema = z.object({
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

const seenMovieSchema = z.object({
  profileId: z.string().optional(),
  movieId: z.number(),
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  watchedAt: z.string(),
});

const episodeProgressSchema = z.object({
  profileId: z.string().optional(),
  seriesId: z.number(),
  episodeId: z.number(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  watched: z.boolean(),
  watchedAt: z.string().nullable().optional(),
});

const trackedSeriesItemSchema = z.object({
  profileId: z.string().optional(),
  seriesId: z.number(),
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  totalEpisodes: z.number(),
  watchedEpisodes: z.number(),
  updatedAt: z.string(),
});

const viewingHistoryItemSchema = z.object({
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

const libraryItemSchema = z.object({
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

const viewingEventSchema = z.object({
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

const userProfileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatar: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const customListSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const customListItemSchema = z.object({
  listId: z.string(),
  mediaId: z.number(),
  mediaType,
  title: z.string(),
  posterPath: z.string().nullable().optional(),
  position: z.number(),
  addedAt: z.string(),
});

const availabilitySnapshotSchema = z.object({
  mediaId: z.number(),
  mediaType,
  region: z.string(),
  providerIds: z.array(z.number()),
  checkedAt: z.string(),
});

const availabilityAlertSchema = z.object({
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

export const browserStoreSchema = z.object({
  schemaVersion: z.number().optional(),
  watchlist: z.array(watchlistItemSchema).optional(),
  seenMovies: z.array(seenMovieSchema).optional(),
  episodeProgress: z.array(episodeProgressSchema).optional(),
  trackedSeries: z.array(trackedSeriesItemSchema).optional(),
  history: z.array(viewingHistoryItemSchema).optional(),
  preferences: preferencesSchema.partial().optional(),
  library: z.array(libraryItemSchema).optional(),
  viewingEvents: z.array(viewingEventSchema).optional(),
  profiles: z.array(userProfileSchema).optional(),
  customLists: z.array(customListSchema).optional(),
  customListItems: z.array(customListItemSchema).optional(),
  availabilitySnapshots: z.array(availabilitySnapshotSchema).optional(),
  availabilityAlerts: z.array(availabilityAlertSchema).optional(),
});

export const cineTrackBackupSchema = z.object({
  format: z.literal("cinetrack-backup"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: browserStoreSchema,
});
