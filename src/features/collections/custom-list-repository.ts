import { getDatabase } from "@/db/client";
import { newUuid } from "@/shared/lib/id";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import type { CustomList, CustomListItem, MediaSummary } from "@/types/media";

const nowIso = () => new Date().toISOString();
const activeProfileId = async () => (await preferencesRepository.getPreferences()).activeProfileId;

export const customListRepository = {
  async list(): Promise<CustomList[]> {
    const profileId = await activeProfileId();
    const db = await getDatabase();
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM custom_lists WHERE profile_id = $1 ORDER BY updated_at DESC",
      [profileId]
    );
    return rows.map((row) => ({
      id: String(row.uuid),
      profileId: String(row.profile_id),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  },

  async create(name: string, description?: string | null): Promise<CustomList> {
    const now = nowIso();
    const list: CustomList = {
      id: newUuid(),
      profileId: await activeProfileId(),
      name: name.trim(),
      description,
      createdAt: now,
      updatedAt: now,
    };
    if (!list.name) throw new Error("Le nom de la liste est requis.");
    const db = await getDatabase();
    await db.execute(
      "INSERT INTO custom_lists (uuid, profile_id, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [list.id, list.profileId, list.name, list.description ?? null, list.createdAt, list.updatedAt]
    );
    return list;
  },

  async remove(listId: string): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM custom_list_items WHERE list_id = $1", [listId]);
    await db.execute("DELETE FROM custom_lists WHERE uuid = $1", [listId]);
  },

  async items(listId: string): Promise<CustomListItem[]> {
    const db = await getDatabase();
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM custom_list_items WHERE list_id = $1 ORDER BY position",
      [listId]
    );
    return rows.map((row) => ({
      listId: String(row.list_id),
      mediaId: Number(row.media_id),
      mediaType: row.media_type === "movie" ? "movie" : "series",
      title: String(row.title),
      posterPath: row.poster_path ? String(row.poster_path) : null,
      position: Number(row.position),
      addedAt: String(row.added_at),
    }));
  },

  async add(listId: string, media: MediaSummary): Promise<void> {
    const items = await this.items(listId);
    const item: CustomListItem = {
      listId,
      mediaId: media.id,
      mediaType: media.mediaType,
      title: media.title,
      posterPath: media.posterPath,
      position: items.length,
      addedAt: nowIso(),
    };
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO custom_list_items (uuid, list_id, media_id, media_type, title, poster_path, position, added_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
       ON CONFLICT (list_id, media_id, media_type) DO UPDATE SET
         title = excluded.title,
         poster_path = excluded.poster_path,
         position = excluded.position,
         updated_at = excluded.updated_at`,
      [
        newUuid(),
        item.listId,
        item.mediaId,
        item.mediaType,
        item.title,
        item.posterPath ?? null,
        item.position,
        item.addedAt,
      ]
    );
    await db.execute("UPDATE custom_lists SET updated_at = $1 WHERE uuid = $2", [nowIso(), listId]);
  },

  async removeItem(listId: string, mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<void> {
    const db = await getDatabase();
    await db.execute("DELETE FROM custom_list_items WHERE list_id = $1 AND media_id = $2 AND media_type = $3", [
      listId,
      mediaId,
      mediaType,
    ]);
  },
};
