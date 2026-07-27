import { browserStore, getDatabase } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import type { CustomList, CustomListItem, MediaSummary } from "@/types/media";

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const activeProfileId = async () => (await preferencesRepository.getPreferences()).activeProfileId;

export const customListRepository = {
  async list(): Promise<CustomList[]> {
    const profileId = await activeProfileId();
    const db = await getDatabase();
    if (!db) return browserStore.read().customLists.filter((list) => list.profileId === profileId);
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM custom_lists WHERE profile_id = $1 ORDER BY updated_at DESC",
      [profileId]
    );
    return rows.map((row) => ({
      id: String(row.id),
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
      id: uid(),
      profileId: await activeProfileId(),
      name: name.trim(),
      description,
      createdAt: now,
      updatedAt: now,
    };
    if (!list.name) throw new Error("Le nom de la liste est requis.");
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      store.customLists.push(list);
      browserStore.write(store);
      return list;
    }
    await db.execute(
      "INSERT INTO custom_lists (id, profile_id, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [list.id, list.profileId, list.name, list.description ?? null, list.createdAt, list.updatedAt]
    );
    return list;
  },

  async remove(listId: string): Promise<void> {
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      store.customLists = store.customLists.filter((list) => list.id !== listId);
      store.customListItems = store.customListItems.filter((item) => item.listId !== listId);
      browserStore.write(store);
      return;
    }
    await db.execute("DELETE FROM custom_list_items WHERE list_id = $1", [listId]);
    await db.execute("DELETE FROM custom_lists WHERE id = $1", [listId]);
  },

  async items(listId: string): Promise<CustomListItem[]> {
    const db = await getDatabase();
    if (!db)
      return browserStore
        .read()
        .customListItems.filter((item) => item.listId === listId)
        .sort((a, b) => a.position - b.position);
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
    if (!db) {
      const store = browserStore.read();
      store.customListItems = store.customListItems.filter(
        (entry) => !(entry.listId === listId && entry.mediaId === media.id && entry.mediaType === media.mediaType)
      );
      store.customListItems.push(item);
      browserStore.write(store);
      return;
    }
    await db.execute(
      "INSERT OR REPLACE INTO custom_list_items (list_id, media_id, media_type, title, poster_path, position, added_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [item.listId, item.mediaId, item.mediaType, item.title, item.posterPath ?? null, item.position, item.addedAt]
    );
    await db.execute("UPDATE custom_lists SET updated_at = $1 WHERE id = $2", [nowIso(), listId]);
  },

  async removeItem(listId: string, mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<void> {
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      store.customListItems = store.customListItems.filter(
        (item) => !(item.listId === listId && item.mediaId === mediaId && item.mediaType === mediaType)
      );
      browserStore.write(store);
      return;
    }
    await db.execute("DELETE FROM custom_list_items WHERE list_id = $1 AND media_id = $2 AND media_type = $3", [
      listId,
      mediaId,
      mediaType,
    ]);
  },
};
