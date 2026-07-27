import { browserStore, getDatabase, type BrowserStore } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

export interface CineTrackBackup {
  format: "cinetrack-backup";
  version: 1;
  exportedAt: string;
  data: BrowserStore;
}

const emptyData = (): BrowserStore => ({
  schemaVersion: 1,
  watchlist: [], seenMovies: [], episodeProgress: [], trackedSeries: [], history: [], preferences: {},
  library: [], viewingEvents: [], profiles: [], customLists: [], customListItems: [],
  availabilitySnapshots: [], availabilityAlerts: [],
});

const mediaType = (value: unknown) => value === "movie" ? "movie" as const : "series" as const;

const arrayFields = [
  "watchlist", "seenMovies", "episodeProgress", "trackedSeries", "history", "library",
  "viewingEvents", "profiles", "customLists", "customListItems", "availabilitySnapshots",
  "availabilityAlerts",
] as const;

function normalizeData(value: unknown): BrowserStore {
  if (!value || typeof value !== "object") throw new Error("Sauvegarde invalide : données manquantes.");
  const raw = value as Partial<BrowserStore>;
  for (const field of arrayFields) {
    if (raw[field] !== undefined && !Array.isArray(raw[field])) {
      throw new Error(`Sauvegarde invalide : le champ ${field} doit être une liste.`);
    }
  }
  if (raw.preferences !== undefined && (!raw.preferences || typeof raw.preferences !== "object" || Array.isArray(raw.preferences))) {
    throw new Error("Sauvegarde invalide : préférences illisibles.");
  }

  const data = { ...emptyData(), ...raw } as BrowserStore;
  if (!data.profiles.some((profile) => profile.id === "default")) {
    data.profiles.unshift({ id: "default", name: "Principal", createdAt: new Date().toISOString() });
  }
  const activeProfileId = typeof data.preferences.activeProfileId === "string"
    ? data.preferences.activeProfileId
    : "default";
  if (!data.profiles.some((profile) => profile.id === activeProfileId)) {
    data.preferences = { ...data.preferences, activeProfileId: "default" };
  }
  return data;
}

export const portableData = {
  async export(): Promise<CineTrackBackup> {
    const db = await getDatabase();
    if (!db) return { format: "cinetrack-backup", version: 1, exportedAt: new Date().toISOString(), data: browserStore.read() };

    const data = emptyData();
    const [watchlist, seen, episodes, tracked, history, preferences, library, events, profiles, lists, listItems, snapshots, alerts] = await Promise.all([
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

    data.watchlist = watchlist.map((row) => ({ profileId: String(row.profile_id ?? "default"), mediaId: Number(row.media_id), mediaType: mediaType(row.media_type), title: String(row.title), posterPath: row.poster_path ? String(row.poster_path) : null, backdropPath: row.backdrop_path ? String(row.backdrop_path) : null, year: row.year === null || row.year === undefined ? null : Number(row.year), rating: row.rating === null || row.rating === undefined ? null : Number(row.rating), createdAt: String(row.created_at) }));
    data.seenMovies = seen.map((row) => ({ profileId: String(row.profile_id ?? "default"), movieId: Number(row.movie_id), title: String(row.title), posterPath: row.poster_path ? String(row.poster_path) : null, backdropPath: row.backdrop_path ? String(row.backdrop_path) : null, watchedAt: String(row.watched_at) }));
    data.episodeProgress = episodes.map((row) => ({ profileId: String(row.profile_id ?? "default"), seriesId: Number(row.series_id), episodeId: Number(row.episode_id), seasonNumber: Number(row.season_number), episodeNumber: Number(row.episode_number), watched: Boolean(row.watched), watchedAt: row.watched_at ? String(row.watched_at) : null }));
    data.trackedSeries = tracked.map((row) => ({ profileId: String(row.profile_id ?? "default"), seriesId: Number(row.series_id), title: String(row.title), posterPath: row.poster_path ? String(row.poster_path) : null, backdropPath: row.backdrop_path ? String(row.backdrop_path) : null, totalEpisodes: Number(row.total_episodes), watchedEpisodes: 0, updatedAt: String(row.updated_at) }));
    data.history = history.map((row) => ({ id: String(row.id), mediaId: Number(row.media_id), mediaType: mediaType(row.media_type), title: String(row.title), action: String(row.action) as never, timestamp: String(row.timestamp), seasonNumber: row.season_number ? Number(row.season_number) : undefined, episodeNumber: row.episode_number ? Number(row.episode_number) : undefined, episodeTitle: row.episode_title ? String(row.episode_title) : undefined, metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined }));
    data.preferences = Object.fromEntries(preferences.map((row) => [String(row.key), JSON.parse(String(row.value))]));
    data.library = library.map((row) => ({ profileId: String(row.profile_id), mediaId: Number(row.media_id), mediaType: mediaType(row.media_type), title: String(row.title), posterPath: row.poster_path ? String(row.poster_path) : null, backdropPath: row.backdrop_path ? String(row.backdrop_path) : null, year: row.year === null || row.year === undefined ? null : Number(row.year), rating: row.rating === null || row.rating === undefined ? null : Number(row.rating), genres: JSON.parse(String(row.genres ?? "[]")), status: String(row.status) as never, favourite: Boolean(row.favourite), userRating: row.user_rating === null ? null : Number(row.user_rating), notes: row.notes ? String(row.notes) : null, tags: JSON.parse(String(row.tags ?? "[]")), startedAt: row.started_at ? String(row.started_at) : null, completedAt: row.completed_at ? String(row.completed_at) : null, rewatchCount: Number(row.rewatch_count), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
    data.viewingEvents = events.map((row) => ({ id: String(row.id), profileId: String(row.profile_id), mediaId: Number(row.media_id), mediaType: mediaType(row.media_type), title: String(row.title), eventType: String(row.event_type) as never, watchedAt: String(row.watched_at), durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes), episodeId: row.episode_id === null ? null : Number(row.episode_id), seasonNumber: row.season_number === null ? null : Number(row.season_number), episodeNumber: row.episode_number === null ? null : Number(row.episode_number) }));
    data.profiles = profiles.map((row) => ({ id: String(row.id), name: String(row.name), avatar: row.avatar ? String(row.avatar) : null, createdAt: String(row.created_at) }));
    data.customLists = lists.map((row) => ({ id: String(row.id), profileId: String(row.profile_id), name: String(row.name), description: row.description ? String(row.description) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }));
    data.customListItems = listItems.map((row) => ({ listId: String(row.list_id), mediaId: Number(row.media_id), mediaType: mediaType(row.media_type), title: String(row.title), posterPath: row.poster_path ? String(row.poster_path) : null, position: Number(row.position), addedAt: String(row.added_at) }));
    data.availabilitySnapshots = snapshots.map((row) => ({ mediaId: Number(row.media_id), mediaType: mediaType(row.media_type), region: String(row.region), providerIds: JSON.parse(String(row.provider_ids ?? "[]")), checkedAt: String(row.checked_at) }));
    data.availabilityAlerts = alerts.map((row) => ({ id: String(row.id), profileId: String(row.profile_id), mediaId: Number(row.media_id), mediaType: mediaType(row.media_type), title: String(row.title), region: String(row.region), providerIds: JSON.parse(String(row.provider_ids ?? "[]")), enabled: Boolean(row.enabled), createdAt: String(row.created_at) }));
    return { format: "cinetrack-backup", version: 1, exportedAt: new Date().toISOString(), data };
  },

  async import(backup: CineTrackBackup): Promise<void> {
    if (!backup || backup.format !== "cinetrack-backup" || backup.version !== 1) throw new Error("Format de sauvegarde non pris en charge.");
    const data = normalizeData(backup.data);
    const db = await getDatabase();
    if (!db) {
      browserStore.write(data);
      preferencesRepository.invalidate();
      return;
    }

    await db.execute("BEGIN IMMEDIATE");
    try {
      for (const table of [
        "availability_alerts", "availability_snapshots", "custom_list_items", "custom_lists",
        "viewing_events", "library_items", "activity_log", "profile_episode_progress",
        "profile_tracked_series", "profile_seen_movies", "profile_watchlist", "preferences", "profiles",
      ]) {
        await db.execute(`DELETE FROM ${table}`);
      }

      for (const item of data.profiles) {
        await db.execute("INSERT INTO profiles VALUES ($1,$2,$3,$4)", [item.id,item.name,item.avatar ?? null,item.createdAt ?? new Date().toISOString()]);
      }
      for (const [key,value] of Object.entries(data.preferences)) {
        await db.execute("INSERT INTO preferences VALUES ($1,$2)", [key,JSON.stringify(value)]);
      }
      for (const item of data.watchlist) {
        await db.execute("INSERT INTO profile_watchlist VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [item.profileId ?? "default",item.mediaId,item.mediaType,item.title,item.posterPath ?? null,item.backdropPath ?? null,item.year ?? null,item.rating ?? null,item.createdAt]);
      }
      for (const item of data.seenMovies) {
        await db.execute("INSERT INTO profile_seen_movies VALUES ($1,$2,$3,$4,$5,$6)", [item.profileId ?? "default",item.movieId,item.title,item.posterPath ?? null,item.backdropPath ?? null,item.watchedAt]);
      }
      for (const item of data.episodeProgress) {
        await db.execute("INSERT INTO profile_episode_progress VALUES ($1,$2,$3,$4,$5,$6,$7)", [item.profileId ?? "default",item.seriesId,item.episodeId,item.seasonNumber,item.episodeNumber,item.watched ? 1 : 0,item.watchedAt ?? null]);
      }
      for (const item of data.trackedSeries) {
        await db.execute("INSERT INTO profile_tracked_series VALUES ($1,$2,$3,$4,$5,$6,$7)", [item.profileId ?? "default",item.seriesId,item.title,item.posterPath ?? null,item.backdropPath ?? null,item.totalEpisodes,item.updatedAt]);
      }
      for (const item of data.history) {
        await db.execute("INSERT INTO activity_log (id,media_id,media_type,title,action,season_number,episode_number,episode_title,metadata,timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [item.id,item.mediaId,item.mediaType,item.title,item.action,item.seasonNumber ?? null,item.episodeNumber ?? null,item.episodeTitle ?? null,item.metadata ? JSON.stringify(item.metadata) : null,item.timestamp]);
      }
      for (const item of data.library) {
        await db.execute("INSERT INTO library_items (profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,genres,status,favourite,user_rating,notes,tags,started_at,completed_at,rewatch_count,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)", [item.profileId,item.mediaId,item.mediaType,item.title,item.posterPath ?? null,item.backdropPath ?? null,item.year ?? null,item.rating ?? null,JSON.stringify(item.genres),item.status,item.favourite ? 1 : 0,item.userRating ?? null,item.notes ?? null,JSON.stringify(item.tags),item.startedAt ?? null,item.completedAt ?? null,item.rewatchCount,item.createdAt,item.updatedAt]);
      }
      for (const item of data.viewingEvents) {
        await db.execute("INSERT INTO viewing_events VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [item.id,item.profileId,item.mediaId,item.mediaType,item.title,item.eventType,item.watchedAt,item.durationMinutes ?? null,item.episodeId ?? null,item.seasonNumber ?? null,item.episodeNumber ?? null]);
      }
      for (const item of data.customLists) {
        await db.execute("INSERT INTO custom_lists VALUES ($1,$2,$3,$4,$5,$6)", [item.id,item.profileId,item.name,item.description ?? null,item.createdAt,item.updatedAt]);
      }
      for (const item of data.customListItems) {
        await db.execute("INSERT INTO custom_list_items VALUES ($1,$2,$3,$4,$5,$6,$7)", [item.listId,item.mediaId,item.mediaType,item.title,item.posterPath ?? null,item.position,item.addedAt]);
      }
      for (const item of data.availabilitySnapshots) {
        await db.execute("INSERT INTO availability_snapshots VALUES ($1,$2,$3,$4,$5)", [item.mediaId,item.mediaType,item.region,JSON.stringify(item.providerIds),item.checkedAt]);
      }
      for (const item of data.availabilityAlerts) {
        await db.execute("INSERT INTO availability_alerts VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [item.id,item.profileId,item.mediaId,item.mediaType,item.title,item.region,JSON.stringify(item.providerIds),item.enabled ? 1 : 0,item.createdAt]);
      }
      await db.execute("COMMIT");
      preferencesRepository.invalidate();
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  },
};
