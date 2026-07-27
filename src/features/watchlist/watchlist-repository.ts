import type { WatchlistItem } from "@/types/media";
import { browserStore, getDatabase } from "@/db/client";
import { historyRepository } from "@/features/history/history-repository";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const storedProfile = (item: WatchlistItem) => item.profileId ?? "default";
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
    if (!db) return browserStore.read().watchlist.filter((item) => storedProfile(item) === profile).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    const rows = await db.select<Array<Record<string, unknown>>>("SELECT * FROM profile_watchlist WHERE profile_id = $1 ORDER BY created_at DESC", [profile]);
    return rows.map(rowToItem);
  },

  async has(mediaId: number, mediaType: WatchlistItem["mediaType"]): Promise<boolean> {
    const profile = await activeProfile();
    const db = await getDatabase();
    if (!db) return browserStore.read().watchlist.some((item) => storedProfile(item) === profile && item.mediaId === mediaId && item.mediaType === mediaType);
    const rows = await db.select<Array<{ count: number }>>("SELECT COUNT(*) count FROM profile_watchlist WHERE profile_id=$1 AND media_id=$2 AND media_type=$3", [profile, mediaId, mediaType]);
    return Number(rows[0]?.count ?? 0) > 0;
  },

  async upsert(item: WatchlistItem): Promise<void> {
    const profile = await activeProfile();
    const alreadyExists = await this.has(item.mediaId, item.mediaType);
    const stored = { ...item, profileId: profile };
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      store.watchlist = [stored, ...store.watchlist.filter((current) => !(storedProfile(current) === profile && current.mediaId === item.mediaId && current.mediaType === item.mediaType))];
      browserStore.write(store);
      if (!alreadyExists) await historyRepository.add({ id: uid(), mediaId: item.mediaId, mediaType: item.mediaType, title: item.title, action: "watchlist:add", timestamp: nowIso(), metadata: { profileId: profile } });
      return;
    }
    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute(`INSERT OR REPLACE INTO profile_watchlist (profile_id,media_id,media_type,title,poster_path,backdrop_path,year,rating,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [profile,item.mediaId,item.mediaType,item.title,item.posterPath ?? null,item.backdropPath ?? null,item.year ?? null,item.rating ?? null,item.createdAt]);
      if (!alreadyExists) await historyRepository.add({ id: uid(), mediaId: item.mediaId, mediaType: item.mediaType, title: item.title, action: "watchlist:add", timestamp: nowIso(), metadata: { profileId: profile } });
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
    if (!db) {
      const store = browserStore.read();
      store.watchlist = store.watchlist.filter((current) => !(storedProfile(current) === profile && current.mediaId === mediaId && current.mediaType === mediaType));
      browserStore.write(store);
      if (item) await historyRepository.add({ id: uid(), mediaId, mediaType, title: item.title, action: "watchlist:remove", timestamp: nowIso(), metadata: { profileId: profile } });
      return;
    }
    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute("DELETE FROM profile_watchlist WHERE profile_id=$1 AND media_id=$2 AND media_type=$3", [profile,mediaId,mediaType]);
      if (item) await historyRepository.add({ id: uid(), mediaId, mediaType, title: item.title, action: "watchlist:remove", timestamp: nowIso(), metadata: { profileId: profile } });
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  },
};
