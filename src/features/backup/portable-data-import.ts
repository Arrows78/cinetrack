import type Database from "@tauri-apps/plugin-sql";
import type { BrowserStore } from "@/db/client";

/**
 * Replaces the entire database content with the backup's data, inside a
 * single transaction (all-or-nothing). Tables are cleared child-first so
 * the FOREIGN KEY constraints from migration 007 never trip mid-import.
 */
export async function importStoreIntoDatabase(db: Database, data: BrowserStore): Promise<void> {
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
      "profile_episode_progress",
      "profile_tracked_series",
      "profile_seen_movies",
      "profile_watchlist",
      "preferences",
      "profiles",
    ]) {
      await db.execute(`DELETE FROM ${table}`);
    }

    for (const item of data.profiles) {
      await db.execute("INSERT INTO profiles VALUES ($1,$2,$3,$4)", [
        item.id,
        item.name,
        item.avatar ?? null,
        item.createdAt ?? new Date().toISOString(),
      ]);
    }
    for (const [key, value] of Object.entries(data.preferences)) {
      await db.execute("INSERT INTO preferences VALUES ($1,$2)", [key, JSON.stringify(value)]);
    }
    for (const item of data.watchlist) {
      await db.execute("INSERT INTO profile_watchlist VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        item.profileId ?? "default",
        item.mediaId,
        item.mediaType,
        item.title,
        item.posterPath ?? null,
        item.backdropPath ?? null,
        item.year ?? null,
        item.rating ?? null,
        item.createdAt,
      ]);
    }
    for (const item of data.seenMovies) {
      await db.execute("INSERT INTO profile_seen_movies VALUES ($1,$2,$3,$4,$5,$6)", [
        item.profileId ?? "default",
        item.movieId,
        item.title,
        item.posterPath ?? null,
        item.backdropPath ?? null,
        item.watchedAt,
      ]);
    }
    for (const item of data.episodeProgress) {
      await db.execute("INSERT INTO profile_episode_progress VALUES ($1,$2,$3,$4,$5,$6,$7)", [
        item.profileId ?? "default",
        item.seriesId,
        item.episodeId,
        item.seasonNumber,
        item.episodeNumber,
        item.watched ? 1 : 0,
        item.watchedAt ?? null,
      ]);
    }
    for (const item of data.trackedSeries) {
      await db.execute("INSERT INTO profile_tracked_series VALUES ($1,$2,$3,$4,$5,$6,$7)", [
        item.profileId ?? "default",
        item.seriesId,
        item.title,
        item.posterPath ?? null,
        item.backdropPath ?? null,
        item.totalEpisodes,
        item.updatedAt,
      ]);
    }
    for (const item of data.history) {
      // profile_id mirrors metadata.profileId (see migration 005) — must
      // stay in sync here or imported history silently drops out of
      // historyRepository.list()'s indexed profile_id query.
      const historyProfileId = String(item.metadata?.profileId ?? "default");
      await db.execute(
        "INSERT INTO activity_log (id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp,profile_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          item.id,
          item.mediaId,
          item.mediaType,
          item.title,
          item.action,
          item.seasonNumber ?? null,
          item.episodeNumber ?? null,
          item.episodeTitle ?? null,
          item.metadata ? JSON.stringify(item.metadata) : null,
          item.timestamp,
          historyProfileId,
        ]
      );
    }
    for (const item of data.library) {
      await db.execute(
        "INSERT INTO library_items (profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
        [
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
      await db.execute("INSERT INTO viewing_events VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [
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
      ]);
    }
    for (const item of data.customLists) {
      await db.execute("INSERT INTO custom_lists VALUES ($1,$2,$3,$4,$5,$6)", [
        item.id,
        item.profileId,
        item.name,
        item.description ?? null,
        item.createdAt,
        item.updatedAt,
      ]);
    }
    for (const item of data.customListItems) {
      await db.execute("INSERT INTO custom_list_items VALUES ($1,$2,$3,$4,$5,$6,$7)", [
        item.listId,
        item.mediaId,
        item.mediaType,
        item.title,
        item.posterPath ?? null,
        item.position,
        item.addedAt,
      ]);
    }
    for (const item of data.availabilitySnapshots) {
      await db.execute("INSERT INTO availability_snapshots VALUES ($1,$2,$3,$4,$5)", [
        item.mediaId,
        item.mediaType,
        item.region,
        JSON.stringify(item.providerIds),
        item.checkedAt,
      ]);
    }
    for (const item of data.availabilityAlerts) {
      await db.execute("INSERT INTO availability_alerts VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        item.id,
        item.profileId,
        item.mediaId,
        item.mediaType,
        item.title,
        item.region,
        JSON.stringify(item.providerIds),
        item.enabled ? 1 : 0,
        item.createdAt,
      ]);
    }
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}
