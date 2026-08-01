// Simulates the Rust commands behind `preferencesRepository`/
// `historyRepository` (see src-tauri/src/commands/preferences.rs and
// history.rs) against the same in-memory node:sqlite database
// `useTestSqlite()` already wires up. Domains not migrated to Rust yet still
// call these two repositories internally (to resolve the active profile, or
// to log activity) — this keeps their tests exercising real SQL end-to-end
// without a Tauri runtime, instead of hitting a missing `invoke()` global.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { defaultPreferences, preferencesSchema } from "@/features/preferences/preferences-repository";
import type {
  Episode,
  EpisodeProgress,
  LibraryItem,
  MediaSummary,
  TrackedSeriesItem,
  UserPreferences,
  ViewingEvent,
  WatchlistItem,
} from "@/types/media";
import type { LibraryPatch } from "@/features/library/library-repository";
import type { PortableData } from "@/features/backup/portable-data-common";
import type { SeriesInput } from "@/features/progress/progress-repository";

function loadPreferences(sqlite: DatabaseSync): UserPreferences {
  const rows = sqlite.prepare("SELECT key, value FROM preferences").all() as Array<{
    key: string;
    value: string;
  }>;
  const raw = rows.reduce<Record<string, unknown>>((acc, row) => {
    try {
      acc[row.key] = JSON.parse(row.value);
    } catch {
      // Ignore invalid legacy values and fall back to defaults.
    }
    return acc;
  }, {});

  return preferencesSchema.parse({ ...defaultPreferences, ...raw });
}

function upsertPreference(sqlite: DatabaseSync, key: string, value: unknown): UserPreferences {
  const current = loadPreferences(sqlite);
  const parsed = (preferencesSchema.parse({ ...current, [key]: value }) as Record<string, unknown>)[key];

  sqlite
    .prepare(
      `INSERT INTO preferences (key, value, updated_at) VALUES ($key, $value, $updatedAt)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run({ $key: key, $value: JSON.stringify(parsed), $updatedAt: new Date().toISOString() });

  return { ...current, [key]: parsed } as UserPreferences;
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function listHistory(sqlite: DatabaseSync, limit: number) {
  const profileId = loadPreferences(sqlite).activeProfileId;
  const rows = sqlite
    .prepare("SELECT * FROM activity_log WHERE profile_id = $profileId ORDER BY timestamp DESC LIMIT $limit")
    .all({ $profileId: profileId, $limit: limit }) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.uuid),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    action: row.action,
    timestamp: String(row.timestamp),
    seasonNumber: row.season_number == null ? undefined : Number(row.season_number),
    episodeNumber: row.episode_number == null ? undefined : Number(row.episode_number),
    episodeTitle: row.episode_title == null ? undefined : String(row.episode_title),
    metadata: parseMetadata(row.metadata),
  }));
}

function addHistoryItem(sqlite: DatabaseSync, item: Record<string, unknown>) {
  const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {};
  const profileId = metadata.profileId ?? loadPreferences(sqlite).activeProfileId;
  const scopedMetadata = { ...metadata, profileId };

  sqlite
    .prepare(
      `INSERT INTO activity_log
        (uuid, profile_id, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp, created_at, updated_at)
       VALUES ($uuid, $profileId, $mediaId, $mediaType, $title, $action, $seasonNumber, $episodeNumber, $episodeTitle, $metadata, $timestamp, $timestamp, $timestamp)
       ON CONFLICT (uuid) DO UPDATE SET
         profile_id = excluded.profile_id,
         media_id = excluded.media_id,
         media_type = excluded.media_type,
         title = excluded.title,
         action = excluded.action,
         season_number = excluded.season_number,
         episode_number = excluded.episode_number,
         episode_title = excluded.episode_title,
         metadata = excluded.metadata,
         timestamp = excluded.timestamp,
         updated_at = excluded.updated_at`
    )
    .run({
      $uuid: item.id,
      $profileId: String(profileId),
      $mediaId: item.mediaId,
      $mediaType: item.mediaType,
      $title: item.title,
      $action: item.action,
      $seasonNumber: (item.seasonNumber as number | undefined) ?? null,
      $episodeNumber: (item.episodeNumber as number | undefined) ?? null,
      $episodeTitle: (item.episodeTitle as string | undefined) ?? null,
      $metadata: JSON.stringify(scopedMetadata),
      $timestamp: item.timestamp,
    } as Record<string, SQLInputValue>);
}

function rowToWatchlistItem(row: Record<string, unknown>): WatchlistItem {
  return {
    id: String(row.uuid),
    profileId: String(row.profile_id ?? "default"),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    year: row.year == null ? null : Number(row.year),
    rating: row.rating == null ? null : Number(row.rating),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function listWatchlist(sqlite: DatabaseSync, profileId: string): WatchlistItem[] {
  const rows = sqlite
    .prepare("SELECT * FROM watchlist_items WHERE profile_id = $profileId ORDER BY created_at DESC")
    .all({ $profileId: profileId }) as Array<Record<string, unknown>>;
  return rows.map(rowToWatchlistItem);
}

function hasWatchlistItem(sqlite: DatabaseSync, profileId: string, mediaId: number, mediaType: string): boolean {
  const rows = sqlite
    .prepare(
      "SELECT COUNT(*) count FROM watchlist_items WHERE profile_id=$profileId AND media_id=$mediaId AND media_type=$mediaType"
    )
    .all({ $profileId: profileId, $mediaId: mediaId, $mediaType: mediaType }) as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0) > 0;
}

function upsertWatchlistItem(sqlite: DatabaseSync, item: WatchlistItem): void {
  const profileId = loadPreferences(sqlite).activeProfileId;
  const alreadyExists = hasWatchlistItem(sqlite, profileId, item.mediaId, item.mediaType);
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO watchlist_items
        (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,created_at,updated_at)
       VALUES ($uuid,$profileId,$mediaId,$mediaType,$title,$posterPath,$backdropPath,$year,$rating,$createdAt,$createdAt)
       ON CONFLICT (profile_id, media_id, media_type) DO UPDATE SET
         title = excluded.title,
         poster_path = excluded.poster_path,
         backdrop_path = excluded.backdrop_path,
         year = excluded.year,
         rating = excluded.rating,
         updated_at = excluded.updated_at`
    )
    .run({
      $uuid: crypto.randomUUID(),
      $profileId: profileId,
      $mediaId: item.mediaId,
      $mediaType: item.mediaType,
      $title: item.title,
      $posterPath: item.posterPath ?? null,
      $backdropPath: item.backdropPath ?? null,
      $year: item.year ?? null,
      $rating: item.rating ?? null,
      $createdAt: item.createdAt || now,
    } as Record<string, SQLInputValue>);

  if (!alreadyExists) {
    addHistoryItem(sqlite, {
      id: crypto.randomUUID(),
      mediaId: item.mediaId,
      mediaType: item.mediaType,
      title: item.title,
      action: "watchlist:add",
      timestamp: now,
      metadata: { profileId },
    });
  }
}

function removeWatchlistItem(sqlite: DatabaseSync, mediaId: number, mediaType: string): void {
  const profileId = loadPreferences(sqlite).activeProfileId;
  const existing = listWatchlist(sqlite, profileId).find(
    (current) => current.mediaId === mediaId && current.mediaType === mediaType
  );

  sqlite
    .prepare("DELETE FROM watchlist_items WHERE profile_id=$profileId AND media_id=$mediaId AND media_type=$mediaType")
    .run({ $profileId: profileId, $mediaId: mediaId, $mediaType: mediaType });

  if (existing) {
    addHistoryItem(sqlite, {
      id: crypto.randomUUID(),
      mediaId,
      mediaType,
      title: existing.title,
      action: "watchlist:remove",
      timestamp: new Date().toISOString(),
      metadata: { profileId },
    });
  }
}

function rowToLibraryItem(row: Record<string, unknown>): LibraryItem {
  return {
    id: String(row.uuid),
    profileId: String(row.profile_id ?? "default"),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    genres: row.genres ? (JSON.parse(String(row.genres)) as string[]) : [],
    status: String(row.status) as LibraryItem["status"],
    favourite: Boolean(row.favourite),
    userRating: row.user_rating === null || row.user_rating === undefined ? null : Number(row.user_rating),
    notes: row.notes ? String(row.notes) : null,
    tags: row.tags ? (JSON.parse(String(row.tags)) as string[]) : [],
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    rewatchCount: Number(row.rewatch_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function listLibrary(sqlite: DatabaseSync, profileId: string): LibraryItem[] {
  const rows = sqlite
    .prepare("SELECT * FROM library_items WHERE profile_id = $profileId ORDER BY updated_at DESC")
    .all({ $profileId: profileId }) as Array<Record<string, unknown>>;
  return rows.map(rowToLibraryItem);
}

function getLibraryItem(
  sqlite: DatabaseSync,
  profileId: string,
  mediaId: number,
  mediaType: string
): LibraryItem | null {
  const rows = sqlite
    .prepare(
      "SELECT * FROM library_items WHERE profile_id = $profileId AND media_id = $mediaId AND media_type = $mediaType LIMIT 1"
    )
    .all({ $profileId: profileId, $mediaId: mediaId, $mediaType: mediaType }) as Array<Record<string, unknown>>;
  return rows[0] ? rowToLibraryItem(rows[0]) : null;
}

function upsertLibraryItem(sqlite: DatabaseSync, media: MediaSummary, patch: LibraryPatch): LibraryItem {
  const profileId = loadPreferences(sqlite).activeProfileId;
  const current = getLibraryItem(sqlite, profileId, media.id, media.mediaType);
  const now = new Date().toISOString();
  const status = patch.status ?? current?.status ?? "planned";
  const item: LibraryItem = {
    id: current?.id ?? crypto.randomUUID(),
    profileId,
    mediaId: media.id,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    year: media.year,
    rating: media.rating,
    genres: media.genres,
    status,
    favourite: patch.favourite ?? current?.favourite ?? false,
    userRating: patch.userRating !== undefined ? patch.userRating : (current?.userRating ?? null),
    notes: patch.notes !== undefined ? patch.notes : (current?.notes ?? null),
    tags: patch.tags ?? current?.tags ?? [],
    startedAt: current?.startedAt ?? (status === "watching" || status === "rewatching" ? now : null),
    completedAt: status === "completed" ? (current?.completedAt ?? now) : null,
    rewatchCount: patch.rewatchCount ?? current?.rewatchCount ?? 0,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };

  sqlite
    .prepare(
      `INSERT INTO library_items (
        uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
        status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at
      ) VALUES ($uuid,$profileId,$mediaId,$mediaType,$title,$posterPath,$backdropPath,$year,$rating,$genres,
        $status,$favourite,$userRating,$notes,$tags,$startedAt,$completedAt,$rewatchCount,$createdAt,$updatedAt)
      ON CONFLICT (profile_id, media_id, media_type) DO UPDATE SET
        title = excluded.title,
        poster_path = excluded.poster_path,
        backdrop_path = excluded.backdrop_path,
        year = excluded.year,
        rating = excluded.rating,
        genres = excluded.genres,
        status = excluded.status,
        favourite = excluded.favourite,
        user_rating = excluded.user_rating,
        notes = excluded.notes,
        tags = excluded.tags,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        rewatch_count = excluded.rewatch_count,
        updated_at = excluded.updated_at`
    )
    .run({
      $uuid: item.id,
      $profileId: item.profileId,
      $mediaId: item.mediaId,
      $mediaType: item.mediaType,
      $title: item.title,
      $posterPath: item.posterPath ?? null,
      $backdropPath: item.backdropPath ?? null,
      $year: item.year ?? null,
      $rating: item.rating ?? null,
      $genres: JSON.stringify(item.genres),
      $status: item.status,
      $favourite: item.favourite ? 1 : 0,
      $userRating: item.userRating ?? null,
      $notes: item.notes ?? null,
      $tags: JSON.stringify(item.tags),
      $startedAt: item.startedAt ?? null,
      $completedAt: item.completedAt ?? null,
      $rewatchCount: item.rewatchCount,
      $createdAt: item.createdAt,
      $updatedAt: item.updatedAt,
    } as Record<string, SQLInputValue>);

  return item;
}

function removeLibraryItem(sqlite: DatabaseSync, profileId: string, mediaId: number, mediaType: string): void {
  sqlite
    .prepare(
      "DELETE FROM library_items WHERE profile_id = $profileId AND media_id = $mediaId AND media_type = $mediaType"
    )
    .run({ $profileId: profileId, $mediaId: mediaId, $mediaType: mediaType });
}

function isMovieSeen(sqlite: DatabaseSync, profileId: string, movieId: number): boolean {
  const rows = sqlite
    .prepare("SELECT COUNT(*) count FROM seen_movies WHERE profile_id=$profileId AND movie_id=$movieId")
    .all({ $profileId: profileId, $movieId: movieId }) as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0) > 0;
}

function toggleMovieSeen(
  sqlite: DatabaseSync,
  profileId: string,
  movie: MediaSummary,
  watched: boolean,
  watchedAt: string
): void {
  if (watched) {
    sqlite
      .prepare(
        `INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
         VALUES ($uuid,$profileId,$movieId,$title,$posterPath,$backdropPath,$watchedAt,$watchedAt,$watchedAt)
         ON CONFLICT (profile_id, movie_id) DO UPDATE SET
           title = excluded.title,
           poster_path = excluded.poster_path,
           backdrop_path = excluded.backdrop_path,
           watched_at = excluded.watched_at,
           updated_at = excluded.updated_at`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $profileId: profileId,
        $movieId: movie.id,
        $title: movie.title,
        $posterPath: movie.posterPath ?? null,
        $backdropPath: movie.backdropPath ?? null,
        $watchedAt: watchedAt,
      } as Record<string, SQLInputValue>);
  } else {
    sqlite
      .prepare("DELETE FROM seen_movies WHERE profile_id=$profileId AND movie_id=$movieId")
      .run({ $profileId: profileId, $movieId: movie.id });
  }

  sqlite
    .prepare(
      `INSERT INTO viewing_events (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at)
       VALUES ($uuid,$profileId,$movieId,'movie',$title,$eventType,$watchedAt,$duration,NULL,NULL,NULL,$watchedAt)`
    )
    .run({
      $uuid: crypto.randomUUID(),
      $profileId: profileId,
      $movieId: movie.id,
      $title: movie.title,
      $eventType: watched ? "watched" : "unwatched",
      $watchedAt: watchedAt,
      $duration: movie.runtime ?? null,
    } as Record<string, SQLInputValue>);

  addHistoryItem(sqlite, {
    id: crypto.randomUUID(),
    mediaId: movie.id,
    mediaType: "movie",
    title: movie.title,
    action: watched ? "movie:watched" : "movie:unwatched",
    timestamp: watchedAt,
    metadata: { profileId },
  });
}

function getEpisodeProgress(sqlite: DatabaseSync, profileId: string, seriesId: number): EpisodeProgress[] {
  const rows = sqlite
    .prepare("SELECT * FROM episode_progress WHERE profile_id=$profileId AND series_id=$seriesId AND watched=1")
    .all({ $profileId: profileId, $seriesId: seriesId }) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.uuid),
    profileId,
    seriesId: Number(row.series_id),
    episodeId: Number(row.episode_id),
    seasonNumber: Number(row.season_number),
    episodeNumber: Number(row.episode_number),
    watched: Boolean(row.watched),
    watchedAt: row.watched_at ? String(row.watched_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

function applyEpisodes(
  sqlite: DatabaseSync,
  profileId: string,
  series: SeriesInput,
  episodes: Episode[],
  watched: boolean,
  watchedAt: string
): number {
  const rows = sqlite
    .prepare(
      "SELECT episode_id FROM episode_progress WHERE profile_id=$profileId AND series_id=$seriesId AND watched=1"
    )
    .all({ $profileId: profileId, $seriesId: series.id }) as Array<{ episode_id: number }>;
  const watchedIds = new Set(rows.map((row) => Number(row.episode_id)));
  const changedEpisodes = episodes.filter((episode) =>
    watched ? !watchedIds.has(episode.id) : watchedIds.has(episode.id)
  );
  if (!changedEpisodes.length) return 0;

  for (const episode of changedEpisodes) {
    if (watched) {
      sqlite
        .prepare(
          `INSERT INTO episode_progress (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at)
           VALUES ($uuid,$profileId,$seriesId,$episodeId,$seasonNumber,$episodeNumber,1,$watchedAt,$watchedAt,$watchedAt)
           ON CONFLICT (profile_id, series_id, episode_id) DO UPDATE SET
             watched = 1,
             watched_at = excluded.watched_at,
             updated_at = excluded.updated_at`
        )
        .run({
          $uuid: crypto.randomUUID(),
          $profileId: profileId,
          $seriesId: series.id,
          $episodeId: episode.id,
          $seasonNumber: episode.seasonNumber,
          $episodeNumber: episode.episodeNumber,
          $watchedAt: watchedAt,
        } as Record<string, SQLInputValue>);
    } else {
      sqlite
        .prepare(
          "DELETE FROM episode_progress WHERE profile_id=$profileId AND series_id=$seriesId AND episode_id=$episodeId"
        )
        .run({ $profileId: profileId, $seriesId: series.id, $episodeId: episode.id });
    }

    sqlite
      .prepare(
        `INSERT INTO viewing_events (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at)
         VALUES ($uuid,$profileId,$seriesId,'series',$title,$eventType,$watchedAt,$duration,$episodeId,$seasonNumber,$episodeNumber,$watchedAt)`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $profileId: profileId,
        $seriesId: series.id,
        $title: series.title,
        $eventType: watched ? "watched" : "unwatched",
        $watchedAt: watchedAt,
        $duration: episode.runtime ?? series.runtime ?? null,
        $episodeId: episode.id,
        $seasonNumber: episode.seasonNumber,
        $episodeNumber: episode.episodeNumber,
      } as Record<string, SQLInputValue>);
  }

  const counts = sqlite
    .prepare(
      "SELECT COUNT(*) count FROM episode_progress WHERE profile_id=$profileId AND series_id=$seriesId AND watched=1"
    )
    .all({ $profileId: profileId, $seriesId: series.id }) as Array<{ count: number }>;

  sqlite
    .prepare(
      `INSERT INTO tracked_series (uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at)
       VALUES ($uuid,$profileId,$seriesId,$title,$posterPath,$backdropPath,$totalEpisodes,$watchedAt,$watchedAt)
       ON CONFLICT (profile_id, series_id) DO UPDATE SET
         title = excluded.title,
         poster_path = excluded.poster_path,
         backdrop_path = excluded.backdrop_path,
         total_episodes = excluded.total_episodes,
         updated_at = excluded.updated_at`
    )
    .run({
      $uuid: crypto.randomUUID(),
      $profileId: profileId,
      $seriesId: series.id,
      $title: series.title,
      $posterPath: series.posterPath ?? null,
      $backdropPath: series.backdropPath ?? null,
      $totalEpisodes: series.numberOfEpisodes ?? Number(counts[0]?.count ?? 0),
      $watchedAt: watchedAt,
    } as Record<string, SQLInputValue>);

  return changedEpisodes.length;
}

function listTrackedSeries(sqlite: DatabaseSync, profileId: string): TrackedSeriesItem[] {
  const rows = sqlite
    .prepare(
      `SELECT ts.uuid,ts.series_id,ts.title,ts.poster_path,ts.backdrop_path,ts.total_episodes,ts.created_at,ts.updated_at,COUNT(ep.episode_id) watched_episodes
       FROM tracked_series ts
       LEFT JOIN episode_progress ep ON ep.profile_id=ts.profile_id AND ep.series_id=ts.series_id AND ep.watched=1
       WHERE ts.profile_id=$profileId
       GROUP BY ts.uuid,ts.series_id,ts.title,ts.poster_path,ts.backdrop_path,ts.total_episodes,ts.created_at,ts.updated_at
       ORDER BY ts.updated_at DESC`
    )
    .all({ $profileId: profileId }) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.uuid),
    profileId,
    seriesId: Number(row.series_id),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    totalEpisodes: Number(row.total_episodes),
    watchedEpisodes: Number(row.watched_episodes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

function listViewingEvents(sqlite: DatabaseSync, profileId: string): ViewingEvent[] {
  const rows = sqlite
    .prepare("SELECT * FROM viewing_events WHERE profile_id = $profileId")
    .all({ $profileId: profileId }) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.uuid),
    profileId,
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    eventType: String(row.event_type) as ViewingEvent["eventType"],
    watchedAt: String(row.watched_at),
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    episodeId: row.episode_id === null ? null : Number(row.episode_id),
    seasonNumber: row.season_number === null ? null : Number(row.season_number),
    episodeNumber: row.episode_number === null ? null : Number(row.episode_number),
  }));
}

function quickCheck(sqlite: DatabaseSync): { healthy: boolean; detail: string } {
  const rows = sqlite.prepare("PRAGMA quick_check").all() as Array<{ quick_check: string }>;
  const detail = rows.map((row) => row.quick_check).join(", ") || "unknown";
  return { healthy: detail === "ok", detail };
}

function exportBackupData(sqlite: DatabaseSync): PortableData {
  const rowsOf = (table: string) => sqlite.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;

  const watchlist = rowsOf("watchlist_items").map((row) => ({
    id: String(row.uuid),
    profileId: String(row.profile_id ?? "default"),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    year: row.year === null || row.year === undefined ? null : Number(row.year),
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
  const seenMovies = rowsOf("seen_movies").map((row) => ({
    profileId: String(row.profile_id ?? "default"),
    movieId: Number(row.movie_id),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    watchedAt: String(row.watched_at),
  }));
  const episodeProgress = rowsOf("episode_progress").map((row) => ({
    id: String(row.uuid),
    profileId: String(row.profile_id ?? "default"),
    seriesId: Number(row.series_id),
    episodeId: Number(row.episode_id),
    seasonNumber: Number(row.season_number),
    episodeNumber: Number(row.episode_number),
    watched: Boolean(row.watched),
    watchedAt: row.watched_at ? String(row.watched_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
  const trackedSeries = rowsOf("tracked_series").map((row) => ({
    id: String(row.uuid),
    profileId: String(row.profile_id ?? "default"),
    seriesId: Number(row.series_id),
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
    totalEpisodes: Number(row.total_episodes),
    watchedEpisodes: 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
  const history = rowsOf("activity_log").map((row) => ({
    id: String(row.uuid),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    action: String(row.action) as never,
    timestamp: String(row.timestamp),
    seasonNumber: row.season_number ? Number(row.season_number) : undefined,
    episodeNumber: row.episode_number ? Number(row.episode_number) : undefined,
    episodeTitle: row.episode_title ? String(row.episode_title) : undefined,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
  }));
  const preferences = Object.fromEntries(
    rowsOf("preferences").map((row) => [String(row.key), JSON.parse(String(row.value))])
  );
  const library = rowsOf("library_items").map((row) => ({
    id: String(row.uuid),
    profileId: String(row.profile_id),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
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
  const viewingEvents = rowsOf("viewing_events").map((row) => ({
    id: String(row.uuid),
    profileId: String(row.profile_id),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    eventType: String(row.event_type) as never,
    watchedAt: String(row.watched_at),
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    episodeId: row.episode_id === null ? null : Number(row.episode_id),
    seasonNumber: row.season_number === null ? null : Number(row.season_number),
    episodeNumber: row.episode_number === null ? null : Number(row.episode_number),
  }));
  const profiles = rowsOf("profiles").map((row) => ({
    id: String(row.uuid),
    name: String(row.name),
    avatar: row.avatar ? String(row.avatar) : null,
    createdAt: String(row.created_at),
  }));
  const customLists = rowsOf("custom_lists").map((row) => ({
    id: String(row.uuid),
    profileId: String(row.profile_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
  const customListItems = rowsOf("custom_list_items").map((row) => ({
    id: String(row.uuid),
    listId: String(row.list_id),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    posterPath: row.poster_path ? String(row.poster_path) : null,
    position: Number(row.position),
    addedAt: String(row.added_at),
    updatedAt: String(row.updated_at),
  }));
  const availabilitySnapshots = rowsOf("availability_snapshots").map((row) => ({
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    region: String(row.region),
    providerIds: JSON.parse(String(row.provider_ids ?? "[]")),
    checkedAt: String(row.checked_at),
  }));
  const availabilityAlerts = rowsOf("availability_alerts").map((row) => ({
    id: String(row.uuid),
    profileId: String(row.profile_id),
    mediaId: Number(row.media_id),
    mediaType: row.media_type === "movie" ? "movie" : "series",
    title: String(row.title),
    region: String(row.region),
    providerIds: JSON.parse(String(row.provider_ids ?? "[]")),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
  }));

  return {
    watchlist,
    seenMovies,
    episodeProgress,
    trackedSeries,
    history,
    preferences,
    library,
    viewingEvents,
    profiles,
    customLists,
    customListItems,
    availabilitySnapshots,
    availabilityAlerts,
  } as PortableData;
}

function importBackupData(sqlite: DatabaseSync, data: PortableData): void {
  for (const table of [
    "availability_alerts",
    "availability_snapshots",
    "custom_list_items",
    "custom_lists",
    "viewing_events",
    "library_items",
    "activity_log",
    "episode_progress",
    "tracked_series",
    "seen_movies",
    "watchlist_items",
    "preferences",
    "profiles",
  ]) {
    sqlite.exec(`DELETE FROM ${table}`);
  }

  for (const item of data.profiles) {
    sqlite
      .prepare(
        "INSERT INTO profiles (uuid, name, avatar, created_at, updated_at) VALUES ($uuid,$name,$avatar,$createdAt,$createdAt)"
      )
      .run({
        $uuid: item.id,
        $name: item.name,
        $avatar: item.avatar ?? null,
        $createdAt: item.createdAt ?? new Date().toISOString(),
      } as Record<string, SQLInputValue>);
  }
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(data.preferences)) {
    sqlite
      .prepare("INSERT INTO preferences (key, value, updated_at) VALUES ($key,$value,$updatedAt)")
      .run({ $key: key, $value: JSON.stringify(value), $updatedAt: now } as Record<string, SQLInputValue>);
  }
  for (const item of data.watchlist) {
    sqlite
      .prepare(
        `INSERT INTO watchlist_items
          (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,created_at,updated_at)
         VALUES ($uuid,$profileId,$mediaId,$mediaType,$title,$posterPath,$backdropPath,$year,$rating,$createdAt,$createdAt)`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $profileId: item.profileId ?? "default",
        $mediaId: item.mediaId,
        $mediaType: item.mediaType,
        $title: item.title,
        $posterPath: item.posterPath ?? null,
        $backdropPath: item.backdropPath ?? null,
        $year: item.year ?? null,
        $rating: item.rating ?? null,
        $createdAt: item.createdAt,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.seenMovies) {
    sqlite
      .prepare(
        `INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
         VALUES ($uuid,$profileId,$movieId,$title,$posterPath,$backdropPath,$watchedAt,$watchedAt,$watchedAt)`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $profileId: item.profileId ?? "default",
        $movieId: item.movieId,
        $title: item.title,
        $posterPath: item.posterPath ?? null,
        $backdropPath: item.backdropPath ?? null,
        $watchedAt: item.watchedAt,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.episodeProgress) {
    const timestamp = item.watchedAt ?? now;
    sqlite
      .prepare(
        `INSERT INTO episode_progress
          (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at)
         VALUES ($uuid,$profileId,$seriesId,$episodeId,$seasonNumber,$episodeNumber,$watched,$watchedAt,$timestamp,$timestamp)`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $profileId: item.profileId ?? "default",
        $seriesId: item.seriesId,
        $episodeId: item.episodeId,
        $seasonNumber: item.seasonNumber,
        $episodeNumber: item.episodeNumber,
        $watched: item.watched ? 1 : 0,
        $watchedAt: item.watchedAt ?? null,
        $timestamp: timestamp,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.trackedSeries) {
    sqlite
      .prepare(
        `INSERT INTO tracked_series
          (uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at)
         VALUES ($uuid,$profileId,$seriesId,$title,$posterPath,$backdropPath,$totalEpisodes,$updatedAt,$updatedAt)`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $profileId: item.profileId ?? "default",
        $seriesId: item.seriesId,
        $title: item.title,
        $posterPath: item.posterPath ?? null,
        $backdropPath: item.backdropPath ?? null,
        $totalEpisodes: item.totalEpisodes,
        $updatedAt: item.updatedAt,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.history) {
    const historyProfileId = String(item.metadata?.profileId ?? "default");
    sqlite
      .prepare(
        `INSERT INTO activity_log
          (uuid,profile_id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,created_at,updated_at)
         VALUES ($uuid,$profileId,$mediaId,$mediaType,$title,$action,$seasonNumber,$episodeNumber,$episodeTitle,$metadata,$timestamp,$timestamp,$timestamp)`
      )
      .run({
        $uuid: item.id,
        $profileId: historyProfileId,
        $mediaId: item.mediaId,
        $mediaType: item.mediaType,
        $title: item.title,
        $action: item.action,
        $seasonNumber: item.seasonNumber ?? null,
        $episodeNumber: item.episodeNumber ?? null,
        $episodeTitle: item.episodeTitle ?? null,
        $metadata: item.metadata ? JSON.stringify(item.metadata) : null,
        $timestamp: item.timestamp,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.library) {
    sqlite
      .prepare(
        `INSERT INTO library_items
          (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at)
         VALUES ($uuid,$profileId,$mediaId,$mediaType,$title,$posterPath,$backdropPath,$year,$rating,$genres,$status,$favourite,$userRating,$notes,$tags,$startedAt,$completedAt,$rewatchCount,$createdAt,$updatedAt)`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $profileId: item.profileId,
        $mediaId: item.mediaId,
        $mediaType: item.mediaType,
        $title: item.title,
        $posterPath: item.posterPath ?? null,
        $backdropPath: item.backdropPath ?? null,
        $year: item.year ?? null,
        $rating: item.rating ?? null,
        $genres: JSON.stringify(item.genres),
        $status: item.status,
        $favourite: item.favourite ? 1 : 0,
        $userRating: item.userRating ?? null,
        $notes: item.notes ?? null,
        $tags: JSON.stringify(item.tags),
        $startedAt: item.startedAt ?? null,
        $completedAt: item.completedAt ?? null,
        $rewatchCount: item.rewatchCount,
        $createdAt: item.createdAt,
        $updatedAt: item.updatedAt,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.viewingEvents) {
    sqlite
      .prepare(
        `INSERT INTO viewing_events
          (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at)
         VALUES ($uuid,$profileId,$mediaId,$mediaType,$title,$eventType,$watchedAt,$durationMinutes,$episodeId,$seasonNumber,$episodeNumber,$watchedAt)`
      )
      .run({
        $uuid: item.id,
        $profileId: item.profileId,
        $mediaId: item.mediaId,
        $mediaType: item.mediaType,
        $title: item.title,
        $eventType: item.eventType,
        $watchedAt: item.watchedAt,
        $durationMinutes: item.durationMinutes ?? null,
        $episodeId: item.episodeId ?? null,
        $seasonNumber: item.seasonNumber ?? null,
        $episodeNumber: item.episodeNumber ?? null,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.customLists) {
    sqlite
      .prepare(
        "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) VALUES ($uuid,$profileId,$name,$description,$createdAt,$updatedAt)"
      )
      .run({
        $uuid: item.id,
        $profileId: item.profileId,
        $name: item.name,
        $description: item.description ?? null,
        $createdAt: item.createdAt,
        $updatedAt: item.updatedAt,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.customListItems) {
    sqlite
      .prepare(
        `INSERT INTO custom_list_items (uuid,list_id,media_id,media_type,title,poster_path,position,added_at,updated_at)
         VALUES ($uuid,$listId,$mediaId,$mediaType,$title,$posterPath,$position,$addedAt,$addedAt)`
      )
      .run({
        $uuid: crypto.randomUUID(),
        $listId: item.listId,
        $mediaId: item.mediaId,
        $mediaType: item.mediaType,
        $title: item.title,
        $posterPath: item.posterPath ?? null,
        $position: item.position,
        $addedAt: item.addedAt,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.availabilitySnapshots) {
    sqlite
      .prepare(
        "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at) VALUES ($mediaId,$mediaType,$region,$providerIds,$checkedAt)"
      )
      .run({
        $mediaId: item.mediaId,
        $mediaType: item.mediaType,
        $region: item.region,
        $providerIds: JSON.stringify(item.providerIds),
        $checkedAt: item.checkedAt,
      } as Record<string, SQLInputValue>);
  }
  for (const item of data.availabilityAlerts) {
    sqlite
      .prepare(
        `INSERT INTO availability_alerts
          (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at)
         VALUES ($uuid,$profileId,$mediaId,$mediaType,$title,$region,$providerIds,$enabled,$createdAt,$createdAt)`
      )
      .run({
        $uuid: item.id,
        $profileId: item.profileId,
        $mediaId: item.mediaId,
        $mediaType: item.mediaType,
        $title: item.title,
        $region: item.region,
        $providerIds: JSON.stringify(item.providerIds),
        $enabled: item.enabled ? 1 : 0,
        $createdAt: item.createdAt,
      } as Record<string, SQLInputValue>);
  }
}

export function createFakeInvoke(sqlite: DatabaseSync) {
  return async (command: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    // Route through the same `getDatabase()` singleton the repository under
    // test uses (memoized in db/client.ts) rather than running our own
    // independent migration pass — repositories often resolve the active
    // profile and their own `getDatabase()` concurrently via `Promise.all`,
    // and node:sqlite is a single connection, so two independent
    // migration/pragma sequences racing on it corrupts transaction state
    // ("Safety level may not be changed inside a transaction"). Imported
    // dynamically (like the harness's own `@tauri-apps/plugin-sql` import)
    // so it resolves against the module registry `vi.resetModules()` leaves
    // in place for this test, not a stale copy captured at file-load time.
    const { getDatabase } = await import("@/db/client");
    await getDatabase();
    switch (command) {
      case "get_preferences":
        return loadPreferences(sqlite);
      case "update_preference":
        return upsertPreference(sqlite, args.key as string, args.value);
      case "refresh_preferences":
        return undefined;
      case "list_history":
        return listHistory(sqlite, (args.limit as number | undefined) ?? 50);
      case "add_history_item":
        addHistoryItem(sqlite, args.item as Record<string, unknown>);
        return undefined;
      case "list_watchlist":
        return listWatchlist(sqlite, loadPreferences(sqlite).activeProfileId);
      case "has_watchlist_item":
        return hasWatchlistItem(
          sqlite,
          loadPreferences(sqlite).activeProfileId,
          args.mediaId as number,
          args.mediaType as string
        );
      case "save_watchlist_item":
        upsertWatchlistItem(sqlite, args.item as WatchlistItem);
        return undefined;
      case "remove_watchlist_item":
        removeWatchlistItem(sqlite, args.mediaId as number, args.mediaType as string);
        return undefined;
      case "list_library":
        return listLibrary(sqlite, loadPreferences(sqlite).activeProfileId);
      case "get_library_item":
        return getLibraryItem(
          sqlite,
          loadPreferences(sqlite).activeProfileId,
          args.mediaId as number,
          args.mediaType as string
        );
      case "save_library_item":
        return upsertLibraryItem(sqlite, args.media as MediaSummary, (args.patch as LibraryPatch) ?? {});
      case "remove_library_item":
        removeLibraryItem(
          sqlite,
          loadPreferences(sqlite).activeProfileId,
          args.mediaId as number,
          args.mediaType as string
        );
        return undefined;
      case "is_movie_seen":
        return isMovieSeen(sqlite, loadPreferences(sqlite).activeProfileId, args.movieId as number);
      case "toggle_movie_seen":
        toggleMovieSeen(
          sqlite,
          loadPreferences(sqlite).activeProfileId,
          args.movie as MediaSummary,
          args.watched as boolean,
          args.watchedAt as string
        );
        return undefined;
      case "get_episode_progress":
        return getEpisodeProgress(sqlite, loadPreferences(sqlite).activeProfileId, args.seriesId as number);
      case "toggle_episodes_watched":
        return applyEpisodes(
          sqlite,
          loadPreferences(sqlite).activeProfileId,
          args.series as SeriesInput,
          args.episodes as Episode[],
          args.watched as boolean,
          args.watchedAt as string
        );
      case "list_tracked_series":
        return listTrackedSeries(sqlite, loadPreferences(sqlite).activeProfileId);
      case "list_viewing_events":
        return listViewingEvents(sqlite, loadPreferences(sqlite).activeProfileId);
      case "check_data_integrity":
        return quickCheck(sqlite);
      case "export_backup_data":
        return exportBackupData(sqlite);
      case "import_backup_data":
        importBackupData(sqlite, args.data as PortableData);
        return undefined;
      default:
        throw new Error(`fake invoke(): unhandled command "${command}"`);
    }
  };
}
