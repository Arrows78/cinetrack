import { browserStore, getDatabase } from "./db";
import { historyRepository } from "./history-repository";
import type { WatchlistItem } from "@/types/media";

const nowIso = () => new Date().toISOString();
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const watchlistRepository = {
  async list(): Promise<WatchlistItem[]> {
    const db = await getDatabase();

    if (!db) {
      return [...browserStore.read().watchlist].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    }

    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM watchlist ORDER BY created_at DESC",
    );

    return rows.map((row) => ({
      mediaId: Number(row.media_id),
      mediaType: row.media_type === "movie" ? "movie" : "series",
      title: String(row.title),
      posterPath: row.poster_path ? String(row.poster_path) : null,
      backdropPath: row.backdrop_path
        ? String(row.backdrop_path)
        : null,
      year: row.year ? Number(row.year) : null,
      rating: row.rating ? Number(row.rating) : null,
      createdAt: String(row.created_at),
    }));
  },

  async has(
    mediaId: number,
    mediaType: WatchlistItem["mediaType"],
  ): Promise<boolean> {
    const db = await getDatabase();

    if (!db) {
      return browserStore
        .read()
        .watchlist.some(
          (item) =>
            item.mediaId === mediaId &&
            item.mediaType === mediaType,
        );
    }

    const rows = await db.select<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM watchlist WHERE media_id = $1 AND media_type = $2",
      [mediaId, mediaType],
    );

    return Number(rows[0]?.count ?? 0) > 0;
  },

  async upsert(item: WatchlistItem): Promise<void> {
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();

      const alreadyExists = store.watchlist.some(
        (current) =>
          current.mediaId === item.mediaId &&
          current.mediaType === item.mediaType,
      );

      store.watchlist = [
        item,
        ...store.watchlist.filter(
          (current) =>
            !(
              current.mediaId === item.mediaId &&
              current.mediaType === item.mediaType
            ),
        ),
      ];

      // Enregistrer la watchlist avant l'historique évite que les deux
      // écritures dans le browserStore s'écrasent mutuellement.
      browserStore.write(store);

      if (!alreadyExists) {
        await historyRepository.add({
          id: uid(),
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          title: item.title,
          action: "watchlist:add",
          timestamp: nowIso(),
        });
      }

      return;
    }

    const alreadyExists = await watchlistRepository.has(
      item.mediaId,
      item.mediaType,
    );

    await db.execute(
      `INSERT OR REPLACE INTO watchlist
        (
          media_id,
          media_type,
          title,
          poster_path,
          backdrop_path,
          year,
          rating,
          created_at
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        item.mediaId,
        item.mediaType,
        item.title,
        item.posterPath ?? null,
        item.backdropPath ?? null,
        item.year ?? null,
        item.rating ?? null,
        item.createdAt,
      ],
    );

    if (!alreadyExists) {
      await historyRepository.add({
        id: uid(),
        mediaId: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        action: "watchlist:add",
        timestamp: nowIso(),
      });
    }
  },

  async remove(
    mediaId: number,
    mediaType: WatchlistItem["mediaType"],
  ): Promise<void> {
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();

      const item = store.watchlist.find(
        (current) =>
          current.mediaId === mediaId &&
          current.mediaType === mediaType,
      );

      store.watchlist = store.watchlist.filter(
        (current) =>
          !(
            current.mediaId === mediaId &&
            current.mediaType === mediaType
          ),
      );

      browserStore.write(store);

      if (item) {
        await historyRepository.add({
          id: uid(),
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          title: item.title,
          action: "watchlist:remove",
          timestamp: nowIso(),
        });
      }

      return;
    }

    const item = (await watchlistRepository.list()).find(
      (current) =>
        current.mediaId === mediaId &&
        current.mediaType === mediaType,
    );

    await db.execute(
      "DELETE FROM watchlist WHERE media_id = $1 AND media_type = $2",
      [mediaId, mediaType],
    );

    if (item) {
      await historyRepository.add({
        id: uid(),
        mediaId: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        action: "watchlist:remove",
        timestamp: nowIso(),
      });
    }
  },
};
