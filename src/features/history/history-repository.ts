import type { ViewingHistoryItem } from "@/types/media";
import { browserStore, getDatabase } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";

const parseMetadata = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

const activeProfileId = async () => (await preferencesRepository.getPreferences()).activeProfileId;
const itemProfileId = (item: ViewingHistoryItem) => String(item.metadata?.profileId ?? "default");

export const historyRepository = {
  async list(limit = 50): Promise<ViewingHistoryItem[]> {
    const profileId = await activeProfileId();
    const db = await getDatabase();
    if (!db) {
      return browserStore
        .read()
        .history.filter((item) => itemProfileId(item) === profileId)
        .slice(0, limit);
    }

    const rows = await db.select<Array<Record<string, unknown>>>(
      `SELECT * FROM activity_log
       WHERE json_extract(COALESCE(metadata, '{}'), '$.profileId') = $1
          OR ($1 = 'default' AND json_extract(COALESCE(metadata, '{}'), '$.profileId') IS NULL)
       ORDER BY timestamp DESC
       LIMIT $2`,
      [profileId, limit]
    );
    return rows.map((row) => ({
      id: String(row.id),
      mediaId: Number(row.media_id),
      mediaType: row.media_type === "movie" ? "movie" : "series",
      title: String(row.title),
      action: row.action as ViewingHistoryItem["action"],
      timestamp: String(row.timestamp),
      seasonNumber: row.season_number == null ? undefined : Number(row.season_number),
      episodeNumber: row.episode_number == null ? undefined : Number(row.episode_number),
      episodeTitle: row.episode_title == null ? undefined : String(row.episode_title),
      metadata: parseMetadata(row.metadata),
    }));
  },

  async add(item: ViewingHistoryItem): Promise<void> {
    const profileId = item.metadata?.profileId ?? (await activeProfileId());
    const scopedItem: ViewingHistoryItem = {
      ...item,
      metadata: { ...item.metadata, profileId },
    };
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      store.history = [scopedItem, ...store.history].slice(0, 500);
      browserStore.write(store);
      return;
    }

    await db.execute(
      `INSERT OR REPLACE INTO activity_log
        (id, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        scopedItem.id,
        scopedItem.mediaId,
        scopedItem.mediaType,
        scopedItem.title,
        scopedItem.action,
        scopedItem.seasonNumber ?? null,
        scopedItem.episodeNumber ?? null,
        scopedItem.episodeTitle ?? null,
        JSON.stringify(scopedItem.metadata),
        scopedItem.timestamp,
      ]
    );
  },
};
