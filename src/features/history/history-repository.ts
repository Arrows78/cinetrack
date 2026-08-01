import type { ViewingHistoryItem } from "@/types/media";
import { getDatabase } from "@/db/client";
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

export const historyRepository = {
  async list(limit = 50): Promise<ViewingHistoryItem[]> {
    const profileId = await activeProfileId();
    const db = await getDatabase();

    const rows = await db.select<Array<Record<string, unknown>>>(
      `SELECT * FROM activity_log WHERE profile_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [profileId, limit]
    );
    return rows.map((row) => ({
      id: String(row.uuid),
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

    await db.execute(
      `INSERT INTO activity_log
        (uuid, profile_id, media_id, media_type, title, action, season_number, episode_number, episode_title, metadata, timestamp, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)
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
         updated_at = excluded.updated_at`,
      [
        scopedItem.id,
        String(profileId),
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
