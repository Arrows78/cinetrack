import { defineCommand } from "@/shared/lib/invoke";
import type { CustomList, CustomListItem, MediaSummary } from "@/types/media";

type CreateCustomListArgs = {
  name: string;
  description: string | null;
};

type CustomListArgs = {
  listId: string;
};

type AddCustomListItemArgs = CustomListArgs & {
  media: MediaSummary;
};

type RemoveCustomListItemArgs = CustomListArgs & {
  mediaId: number;
  mediaType: MediaSummary["mediaType"];
};

export const customListCommands = {
  list: defineCommand<undefined, CustomList[]>("list_custom_lists"),
  create: defineCommand<CreateCustomListArgs, CustomList>("create_custom_list"),
  remove: defineCommand<CustomListArgs, void>("remove_custom_list"),
  listItems: defineCommand<CustomListArgs, CustomListItem[]>("list_custom_list_items"),
  addItem: defineCommand<AddCustomListItemArgs, void>("add_custom_list_item"),
  removeItem: defineCommand<RemoveCustomListItemArgs, void>("remove_custom_list_item"),
} as const;
