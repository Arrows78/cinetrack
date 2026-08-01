import { getDatabase } from "@/db/client";
import { newUuid } from "@/shared/lib/id";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import type { LibraryItem, LibraryStatus, MediaSummary } from "@/types/media";

const nowIso = () => new Date().toISOString();

const rowToLibraryItem = (row: Record<string, unknown>): LibraryItem => ({
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
  status: String(row.status) as LibraryStatus,
  favourite: Boolean(row.favourite),
  userRating: row.user_rating === null || row.user_rating === undefined ? null : Number(row.user_rating),
  notes: row.notes ? String(row.notes) : null,
  tags: row.tags ? (JSON.parse(String(row.tags)) as string[]) : [],
  startedAt: row.started_at ? String(row.started_at) : null,
  completedAt: row.completed_at ? String(row.completed_at) : null,
  rewatchCount: Number(row.rewatch_count ?? 0),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

async function activeProfileId() {
  return (await preferencesRepository.getPreferences()).activeProfileId;
}

export interface LibraryPatch {
  status?: LibraryStatus;
  favourite?: boolean;
  userRating?: number | null;
  notes?: string | null;
  tags?: string[];
  rewatchCount?: number;
}

export const libraryRepository = {
  async list(profileId?: string): Promise<LibraryItem[]> {
    const profile = profileId ?? (await activeProfileId());
    const db = await getDatabase();
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM library_items WHERE profile_id = $1 ORDER BY updated_at DESC",
      [profile]
    );
    return rows.map(rowToLibraryItem);
  },

  async get(mediaId: number, mediaType: MediaSummary["mediaType"], profileId?: string): Promise<LibraryItem | null> {
    const profile = profileId ?? (await activeProfileId());
    const db = await getDatabase();
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3 LIMIT 1",
      [profile, mediaId, mediaType]
    );
    return rows[0] ? rowToLibraryItem(rows[0]) : null;
  },

  async upsert(media: MediaSummary, patch: LibraryPatch = {}, profileId?: string): Promise<LibraryItem> {
    const profile = profileId ?? (await activeProfileId());
    const current = await this.get(media.id, media.mediaType, profile);
    const now = nowIso();
    const status = patch.status ?? current?.status ?? "planned";
    const item: LibraryItem = {
      id: current?.id ?? newUuid(),
      profileId: profile,
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

    const db = await getDatabase();
    await db.execute(
      `INSERT INTO library_items (
        uuid, profile_id, media_id, media_type, title, poster_path, backdrop_path, year, rating, genres,
        status, favourite, user_rating, notes, tags, started_at, completed_at, rewatch_count, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
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
        updated_at = excluded.updated_at`,
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
    return item;
  },

  async remove(mediaId: number, mediaType: MediaSummary["mediaType"], profileId?: string): Promise<void> {
    const profile = profileId ?? (await activeProfileId());
    const db = await getDatabase();
    await db.execute("DELETE FROM library_items WHERE profile_id = $1 AND media_id = $2 AND media_type = $3", [
      profile,
      mediaId,
      mediaType,
    ]);
  },
};
