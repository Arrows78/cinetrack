import type { WatchlistItem } from "@/types/media";
import { getDatabase } from "@/db/client";
import { newUuid } from "@/shared/lib/id";
import { historyRepository } from "@/features/history/history-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

const nowIso = () => new Date().toISOString();
const activeProfile = async () => (await preferencesRepository.getPreferences()).activeProfileId;

const rowToItem = (row: Record<string, unknown>): WatchlistItem => ({
  profileId: String(row.profile_id ?? "default"),
  mediaId: Number(row.media_id),
  mediaType: row.media_type === "movie" ? "movie" : "series",
  title: String(row.title),
  posterPath: row.poster_path ? String(row.poster_path) : null,
  backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
  year: row.year == null ? null : Number(row.year),
  rating: row.rating == null ? null : Number(row.rating),
  createdAt: String(row.created_at),
});

export const watchlistRepository = {
  async list(): Promise<WatchlistItem[]> {
    const profile = await activeProfile();
    const db = await getDatabase();
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM watchlist_items WHERE profile_id = $1 ORDER BY created_at DESC",
      [profile]
    );
    return rows.map(rowToItem);
  },

  async has(mediaId: number, mediaType: WatchlistItem["mediaType"]): Promise<boolean> {
    const profile = await activeProfile();
    const db = await getDatabase();
    const rows = await db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) count FROM watchlist_items WHERE profile_id=$1 AND media_id=$2 AND media_type=$3",
      [profile, mediaId, mediaType]
    );
    return Number(rows[0]?.count ?? 0) > 0;
  },

  async upsert(item: WatchlistItem): Promise<void> {
    const profile = await activeProfile();
    const alreadyExists = await this.has(item.mediaId, item.mediaType);
    const db = await getDatabase();
    const now = nowIso();
    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute(
        `INSERT INTO watchlist_items
          (uuid,profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
         ON CONFLICT (profile_id, media_id, media_type) DO UPDATE SET
           title = excluded.title,
           poster_path = excluded.poster_path,
           backdrop_path = excluded.backdrop_path,
           year = excluded.year,
           rating = excluded.rating,
           updated_at = excluded.updated_at`,
        [
          newUuid(),
          profile,
          item.mediaId,
          item.mediaType,
          item.title,
          item.posterPath ?? null,
          item.backdropPath ?? null,
          item.year ?? null,
          item.rating ?? null,
          item.createdAt || now,
        ]
      );
      if (!alreadyExists)
        await historyRepository.add({
          id: newUuid(),
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          title: item.title,
          action: "watchlist:add",
          timestamp: nowIso(),
          metadata: { profileId: profile },
        });
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  },

  async remove(mediaId: number, mediaType: WatchlistItem["mediaType"]): Promise<void> {
    const profile = await activeProfile();
    const item = (await this.list()).find((current) => current.mediaId === mediaId && current.mediaType === mediaType);
    const db = await getDatabase();
    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute("DELETE FROM watchlist_items WHERE profile_id=$1 AND media_id=$2 AND media_type=$3", [
        profile,
        mediaId,
        mediaType,
      ]);
      if (item)
        await historyRepository.add({
          id: newUuid(),
          mediaId,
          mediaType,
          title: item.title,
          action: "watchlist:remove",
          timestamp: nowIso(),
          metadata: { profileId: profile },
        });
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  },
};
