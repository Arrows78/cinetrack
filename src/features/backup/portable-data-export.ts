import type Database from "@tauri-apps/plugin-sql";
import type { BrowserStore } from "@/db/client";
import { emptyData, mediaType } from "./portable-data-common";

/** Reads every persisted table and maps the rows to the portable backup shape. */
export async function exportDatabaseToStore(db: Database): Promise<BrowserStore> {
  const data = emptyData();
  const [
    watchlist,
    seen,
    episodes,
    tracked,
    history,
    preferences,
    library,
    events,
    profiles,
    lists,
    listItems,
    snapshots,
    alerts,
  ] = await Promise.all([
    db.select<Array<Record<string, unknown>>>("SELECT * FROM profile_watchlist"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM profile_seen_movies"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM profile_episode_progress"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM profile_tracked_series"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM activity_log"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM preferences"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM library_items"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM viewing_events"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM profiles"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM custom_lists"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM custom_list_items"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM availability_snapshots"),
    db.select<Array<Record<string, unknown>>>("SELECT * FROM availability_alerts"),
  ]);

  data.watchlist = watchlist.map((row) => ({
    profileId: String(row.profile_id ?? "default"),
    mediaId: Number(row.media_id),
    mediaType: mediaType(row.media_type),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    createdAt: String(row.created_at),
  }));
  data.seenMovies = seen.map((row) => ({
    profileId: String(row.profile_id ?? "default"),
    movieId: Number(row.movie_id),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    watchedAt: String(row.watched_at),
  }));
  data.episodeProgress = episodes.map((row) => ({
    profileId: String(row.profile_id ?? "default"),
    seriesId: Number(row.series_id),
    episodeId: Number(row.episode_id),
    seasonNumber: Number(row.season_number),
    episodeNumber: Number(row.episode_number),
    watched: Boolean(row.watched),
    watchedAt: row.watched_at ? String(row.watched_at) : null,
  }));
  data.trackedSeries = tracked.map((row) => ({
    profileId: String(row.profile_id ?? "default"),
    seriesId: Number(row.series_id),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    totalEpisodes: Number(row.total_episodes),
    watchedEpisodes: 0,
    updatedAt: String(row.updated_at),
  }));
  data.history = history.map((row) => ({
    id: String(row.id),
    mediaId: Number(row.media_id),
    mediaType: mediaType(row.media_type),
    title: String(row.title),
    action: String(row.action) as never,
    timestamp: String(row.timestamp),
    seasonNumber: row.season_number ? Number(row.season_number) : undefined,
    episodeNumber: row.episode_number ? Number(row.episode_number) : undefined,
    episodeTitle: row.episode_title ? String(row.episode_title) : undefined,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
  }));
  data.preferences = Object.fromEntries(preferences.map((row) => [String(row.key), JSON.parse(String(row.value))]));
  data.library = library.map((row) => ({
    profileId: String(row.profile_id),
    mediaId: Number(row.media_id),
    mediaType: mediaType(row.media_type),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    genres: JSON.parse(String(row.genres ?? "[]")),
    status: String(row.status) as never,
    favourite: Boolean(row.favourite),
    userRating: row.user_rating === null ? null : Number(row.user_rating),
    notes: row.notes ? String(row.notes) : null,
    tags: JSON.parse(String(row.tags ?? "[]")),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    rewatchCount: Number(row.rewatch_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
  data.viewingEvents = events.map((row) => ({
    id: String(row.id),
    profileId: String(row.profile_id),
    mediaId: Number(row.media_id),
    mediaType: mediaType(row.media_type),
    title: String(row.title),
    eventType: String(row.event_type) as never,
    watchedAt: String(row.watched_at),
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    episodeId: row.episode_id === null ? null : Number(row.episode_id),
    seasonNumber: row.season_number === null ? null : Number(row.season_number),
    episodeNumber: row.episode_number === null ? null : Number(row.episode_number),
  }));
  data.profiles = profiles.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    avatar: row.avatar ? String(row.avatar) : null,
    createdAt: String(row.created_at),
  }));
  data.customLists = lists.map((row) => ({
    id: String(row.id),
    profileId: String(row.profile_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
  data.customListItems = listItems.map((row) => ({
    listId: String(row.list_id),
    mediaId: Number(row.media_id),
    mediaType: mediaType(row.media_type),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    position: Number(row.position),
    addedAt: String(row.added_at),
  }));
  data.availabilitySnapshots = snapshots.map((row) => ({
    mediaId: Number(row.media_id),
    mediaType: mediaType(row.media_type),
    region: String(row.region),
    providerIds: JSON.parse(String(row.provider_ids ?? "[]")),
    checkedAt: String(row.checked_at),
  }));
  data.availabilityAlerts = alerts.map((row) => ({
    id: String(row.id),
    profileId: String(row.profile_id),
    mediaId: Number(row.media_id),
    mediaType: mediaType(row.media_type),
    title: String(row.title),
    region: String(row.region),
    providerIds: JSON.parse(String(row.provider_ids ?? "[]")),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
  }));
  return data;
}
