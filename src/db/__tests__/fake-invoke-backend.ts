// Simulates the Rust commands behind `preferencesRepository`/
// `historyRepository` (see src-tauri/src/commands/preferences.rs and
// history.rs) against the same in-memory node:sqlite database
// `useTestSqlite()` already wires up. Domains not migrated to Rust yet still
// call these two repositories internally (to resolve the active profile, or
// to log activity) — this keeps their tests exercising real SQL end-to-end
// without a Tauri runtime, instead of hitting a missing `invoke()` global.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { defaultPreferences, preferencesSchema } from "@/features/preferences/preferences-repository";
import type { LibraryItem, MediaSummary, UserPreferences, WatchlistItem } from "@/types/media";
import type { LibraryPatch } from "@/features/library/library-repository";

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
      case "invalidate_preferences_cache":
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
      case "upsert_watchlist_item":
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
      case "upsert_library_item":
        return upsertLibraryItem(sqlite, args.media as MediaSummary, (args.patch as LibraryPatch) ?? {});
      case "remove_library_item":
        removeLibraryItem(
          sqlite,
          loadPreferences(sqlite).activeProfileId,
          args.mediaId as number,
          args.mediaType as string
        );
        return undefined;
      default:
        throw new Error(`fake invoke(): unhandled command "${command}"`);
    }
  };
}
