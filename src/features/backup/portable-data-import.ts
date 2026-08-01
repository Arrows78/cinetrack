import type Database from "@tauri-apps/plugin-sql";
import { newUuid } from "@/shared/lib/id";
import type { PortableData } from "./portable-data-common";

/**
 * Replaces the entire database content with the backup's data, inside a
 * single transaction (all-or-nothing). Tables are cleared child-first so
 * the FOREIGN KEY constraints never trip mid-import. `id` (the internal
 * auto-increment rowid) is never written — SQLite assigns a fresh one on
 * every insert. Rows whose app-level identity is the `uuid` column
 * (profiles, custom lists, history, viewing events, alerts) reuse the
 * backup's `id` field as that uuid so identity survives a round trip; rows
 * with no app-level identity (watchlist, seen movies, episode progress,
 * tracked series, list items) get a fresh uuid, which is harmless since
 * nothing references them by it.
 */
export async function importStoreIntoDatabase(db: Database, data: PortableData): Promise<void> {
  await db.execute("BEGIN IMMEDIATE");
  try {
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
      await db.execute(`DELETE FROM ${table}`);
    }

    for (const item of data.profiles) {
      await db.execute("INSERT INTO profiles (uuid, name, avatar, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)", [
        item.id,
        item.name,
        item.avatar ?? null,
        item.createdAt ?? new Date().toISOString(),
      ]);
    }
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(data.preferences)) {
      await db.execute("INSERT INTO preferences (key, value, updated_at) VALUES ($1,$2,$3)", [
        key,
        JSON.stringify(value),
        now,
      ]);
    }
    for (const item of data.watchlist) {
      await db.execute(
        `INSERT INTO watchlist_items
          (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [
          newUuid(),
          item.profileId ?? "default",
          item.mediaId,
          item.mediaType,
          item.title,
          item.posterPath ?? null,
          item.backdropPath ?? null,
          item.year ?? null,
          item.rating ?? null,
          item.createdAt,
        ]
      );
    }
    for (const item of data.seenMovies) {
      await db.execute(
        `INSERT INTO seen_movies (uuid,profile_id,movie_id,title,poster_path,backdrop_path,watched_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)`,
        [
          newUuid(),
          item.profileId ?? "default",
          item.movieId,
          item.title,
          item.posterPath ?? null,
          item.backdropPath ?? null,
          item.watchedAt,
        ]
      );
    }
    for (const item of data.episodeProgress) {
      const timestamp = item.watchedAt ?? now;
      await db.execute(
        `INSERT INTO episode_progress
          (uuid,profile_id,series_id,episode_id,season_number,episode_number,watched,watched_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
        [
          newUuid(),
          item.profileId ?? "default",
          item.seriesId,
          item.episodeId,
          item.seasonNumber,
          item.episodeNumber,
          item.watched ? 1 : 0,
          item.watchedAt ?? null,
          timestamp,
        ]
      );
    }
    for (const item of data.trackedSeries) {
      await db.execute(
        `INSERT INTO tracked_series
          (uuid,profile_id,series_id,title,poster_path,backdrop_path,total_episodes,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          newUuid(),
          item.profileId ?? "default",
          item.seriesId,
          item.title,
          item.posterPath ?? null,
          item.backdropPath ?? null,
          item.totalEpisodes,
          item.updatedAt,
        ]
      );
    }
    for (const item of data.history) {
      // profile_id mirrors metadata.profileId — must stay in sync here or
      // imported history silently drops out of historyRepository.list()'s
      // indexed profile_id query.
      const historyProfileId = String(item.metadata?.profileId ?? "default");
      await db.execute(
        `INSERT INTO activity_log
          (uuid,profile_id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11)`,
        [
          item.id,
          historyProfileId,
          item.mediaId,
          item.mediaType,
          item.title,
          item.action,
          item.seasonNumber ?? null,
          item.episodeNumber ?? null,
          item.episodeTitle ?? null,
          item.metadata ? JSON.stringify(item.metadata) : null,
          item.timestamp,
        ]
      );
    }
    for (const item of data.library) {
      await db.execute(
        `INSERT INTO library_items
          (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          newUuid(),
          item.profileId,
          item.mediaId,
          item.mediaType,
          item.title,
          item.posterPath ?? null,
          item.backdropPath ?? null,
          item.year ?? null,
          item.rating ?? null,
          JSON.stringify(item.genres),
          item.status,
          item.favourite ? 1 : 0,
          item.userRating ?? null,
          item.notes ?? null,
          JSON.stringify(item.tags),
          item.startedAt ?? null,
          item.completedAt ?? null,
          item.rewatchCount,
          item.createdAt,
          item.updatedAt,
        ]
      );
    }
    for (const item of data.viewingEvents) {
      await db.execute(
        `INSERT INTO viewing_events
          (uuid,profile_id,media_id,media_type,title,event_type,watched_at,duration_minutes,episode_id,season_number,episode_number,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$7)`,
        [
          item.id,
          item.profileId,
          item.mediaId,
          item.mediaType,
          item.title,
          item.eventType,
          item.watchedAt,
          item.durationMinutes ?? null,
          item.episodeId ?? null,
          item.seasonNumber ?? null,
          item.episodeNumber ?? null,
        ]
      );
    }
    for (const item of data.customLists) {
      await db.execute(
        "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [item.id, item.profileId, item.name, item.description ?? null, item.createdAt, item.updatedAt]
      );
    }
    for (const item of data.customListItems) {
      await db.execute(
        `INSERT INTO custom_list_items (uuid,list_id,media_id,media_type,title,poster_path,position,added_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          newUuid(),
          item.listId,
          item.mediaId,
          item.mediaType,
          item.title,
          item.posterPath ?? null,
          item.position,
          item.addedAt,
        ]
      );
    }
    for (const item of data.availabilitySnapshots) {
      await db.execute(
        "INSERT INTO availability_snapshots (media_id, media_type, region, provider_ids, checked_at) VALUES ($1,$2,$3,$4,$5)",
        [item.mediaId, item.mediaType, item.region, JSON.stringify(item.providerIds), item.checkedAt]
      );
    }
    for (const item of data.availabilityAlerts) {
      await db.execute(
        `INSERT INTO availability_alerts
          (uuid,profile_id,media_id,media_type,title,region,provider_ids,enabled,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
        [
          item.id,
          item.profileId,
          item.mediaId,
          item.mediaType,
          item.title,
          item.region,
          JSON.stringify(item.providerIds),
          item.enabled ? 1 : 0,
          item.createdAt,
        ]
      );
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}
