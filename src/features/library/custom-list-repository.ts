import { customListCommands } from "@/features/library/custom-list-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { CustomList, CustomListItem, MediaSummary } from "@/types/media";

// The name validation, position assignment/dedup and active-profile
// resolution now live in Rust (see src-tauri/src/lists/custom/)
// — this repository is a thin invoke() wrapper.
export const customListRepository = {
  async list(): Promise<CustomList[]> {
    return invokeTypedCommand(customListCommands.list);
  },

  async create(name: string, description?: string | null): Promise<CustomList> {
    return invokeTypedCommand(customListCommands.create, { name, description: description ?? null });
  },

  async remove(listId: string): Promise<void> {
    await invokeTypedCommand(customListCommands.remove, { listId });
  },

  async items(listId: string): Promise<CustomListItem[]> {
    return invokeTypedCommand(customListCommands.listItems, { listId });
  },

  async add(listId: string, media: MediaSummary): Promise<void> {
    await invokeTypedCommand(customListCommands.addItem, { listId, media });
  },

  async removeItem(listId: string, mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<void> {
    await invokeTypedCommand(customListCommands.removeItem, { listId, mediaId, mediaType });
  },
};
