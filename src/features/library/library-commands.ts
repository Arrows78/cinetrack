import { defineCommand } from "@/shared/lib/invoke";
import type { LibraryItem, LibraryStatus, MediaSummary } from "@/types/media";

export interface LibraryPatch {
  status?: LibraryStatus;
  favourite?: boolean;
  userRating?: number | null;
  notes?: string | null;
  tags?: string[];
  rewatchCount?: number;
}

type LibraryIdentityArgs = {
  mediaId: number;
  mediaType: MediaSummary["mediaType"];
};

type SaveLibraryItemArgs = {
  media: MediaSummary;
  patch?: LibraryPatch;
};

export const libraryCommands = {
  list: defineCommand<undefined, LibraryItem[]>("list_library"),
  get: defineCommand<LibraryIdentityArgs, LibraryItem | null>("get_library_item"),
  save: defineCommand<SaveLibraryItemArgs, LibraryItem>("save_library_item"),
  remove: defineCommand<LibraryIdentityArgs, void>("remove_library_item"),
  has: defineCommand<LibraryIdentityArgs, boolean>("has_library_item"),
  removeIfPlanned: defineCommand<LibraryIdentityArgs, boolean>("remove_planned_library_item"),
} as const;
