import { browserStore, getDatabase } from './db'
import type { ViewingHistoryItem } from '@/types/media'

export const historyRepository = {
  async list(limit = 50): Promise<ViewingHistoryItem[]> {
    const db = await getDatabase()

    if (!db) {
      return browserStore.read().history.slice(0, limit)
    }

    const rows = await db.select<Array<Record<string, unknown>>>(
      'SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT $1',
      [limit]
    )

    return rows.map((row) => ({
      id: String(row.id),
      mediaId: Number(row.media_id),
      mediaType: row.media_type === 'movie' ? 'movie' : 'series',
      title: String(row.title),
      action: row.action as ViewingHistoryItem['action'],
      timestamp: String(row.timestamp),
      seasonNumber: row.season_number ? Number(row.season_number) : undefined,
      episodeNumber: row.episode_number ? Number(row.episode_number) : undefined,
      episodeTitle: row.episode_title ? String(row.episode_title) : undefined,
    }))
  },

  async add(item: ViewingHistoryItem) {
    const db = await getDatabase()

    if (!db) {
      const store = browserStore.read()
      store.history = [item, ...store.history].slice(0, 200)
      browserStore.write(store)
      return
    }

    await db.execute(
      `INSERT OR REPLACE INTO activity_log
        (id, media_id, media_type, title, action, season_number, episode_number, episode_title, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        item.id,
        item.mediaId,
        item.mediaType,
        item.title,
        item.action,
        item.seasonNumber ?? null,
        item.episodeNumber ?? null,
        item.episodeTitle ?? null,
        item.timestamp,
      ]
    )
  },
}
