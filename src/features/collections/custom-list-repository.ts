import { invokeCommand } from "@/shared/lib/invoke";
import type { CustomList, CustomListItem, MediaSummary } from "@/types/media";

// The name validation, position assignment/dedup and active-profile
// resolution now live in Rust (see src-tauri/src/commands/custom_lists.rs)
// — this repository is a thin invoke() wrapper.
export const customListRepository = {
  async list(): Promise<CustomList[]> {
    return invokeCommand<CustomList[]>("list_custom_lists");
  },

  async create(name: string, description?: string | null): Promise<CustomList> {
    return invokeCommand<CustomList>("create_custom_list", { name, description: description ?? null });
  },

  async remove(listId: string): Promise<void> {
    await invokeCommand<void>("remove_custom_list", { listId });
  },

  async items(listId: string): Promise<CustomListItem[]> {
    return invokeCommand<CustomListItem[]>("list_custom_list_items", { listId });
  },

  async add(listId: string, media: MediaSummary): Promise<void> {
    await invokeCommand<void>("add_custom_list_item", { listId, media });
  },

  async removeItem(listId: string, mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<void> {
    await invokeCommand<void>("remove_custom_list_item", { listId, mediaId, mediaType });
  },
};
