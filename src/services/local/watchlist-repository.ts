import { browserStore, getDatabase } from './db';
import type { WatchlistItem } from '@/types/media';

export const watchlistRepository = {
  async list(): Promise<WatchlistItem[]> {
    const db = await getDatabase();

    if (!db) {
      return browserStore.read().watchlist.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const rows = await db.select<Array<Record<string, unknown>>>(
      'SELECT * FROM watchlist ORDER BY created_at DESC',
    );

    return rows.map((row) => ({
      mediaId: Number(row.media_id),
      mediaType: row.media_type === 'movie' ? 'movie' : 'series',
      title: String(row.title),
      posterPath: row.poster_path ? String(row.poster_path) : null,
      backdropPath: row.backdrop_path ? String(row.backdrop_path) : null,
      year: row.year ? Number(row.year) : null,
      rating: row.rating ? Number(row.rating) : null,
      createdAt: String(row.created_at),
    }));
  },

  async has(mediaId: number, mediaType: WatchlistItem['mediaType']) {
    const db = await getDatabase();

    if (!db) {
      return browserStore
        .read()
        .watchlist.some((item) => item.mediaId === mediaId && item.mediaType === mediaType);
    }

    const rows = await db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) as count FROM watchlist WHERE media_id = $1 AND media_type = $2',
      [mediaId, mediaType],
    );

    return Number(rows[0]?.count ?? 0) > 0;
  },

  async upsert(item: WatchlistItem) {
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();
      store.watchlist = [
        item,
        ...store.watchlist.filter(
          (current) =>
            !(current.mediaId === item.mediaId && current.mediaType === item.mediaType),
        ),
      ];
      browserStore.write(store);
      return;
    }

    await db.execute(
      `INSERT OR REPLACE INTO watchlist
        (media_id, media_type, title, poster_path, backdrop_path, year, rating, created_at)
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
  },

  async remove(mediaId: number, mediaType: WatchlistItem['mediaType']) {
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();
      store.watchlist = store.watchlist.filter(
        (item) => !(item.mediaId === mediaId && item.mediaType === mediaType),
      );
      browserStore.write(store);
      return;
    }

    await db.execute('DELETE FROM watchlist WHERE media_id = $1 AND media_type = $2', [
      mediaId,
      mediaType,
    ]);
  },
};
