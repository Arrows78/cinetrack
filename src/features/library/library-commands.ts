import { defineCommand } from "@/shared/lib/invoke";
import type { LibraryItem, LibraryStatus, MediaSummary, MediaType } from "@/types/media";

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

// Mirrors src-tauri/src/library/models.rs's LibrarySort — server-side sort
// for the cursor-paginated Library page (list_library_page), as opposed to
// LibraryFilterState.sort's client-side sort over the whole (safety-capped)
// list_library array used everywhere else useLibrary() is called.
export type LibraryPageSort = "recent" | "title" | "rating";

export interface LibraryListParams {
  mediaType?: MediaType;
  status?: LibraryStatus;
  favouritesOnly: boolean;
  search?: string;
  sort: LibraryPageSort;
  cursor?: string;
  limit: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  nextCursor: string | null;
}

export const libraryCommands = {
  list: defineCommand<undefined, LibraryItem[]>("list_library"),
  listPage: defineCommand<LibraryListParams, LibraryPage>("list_library_page"),
  get: defineCommand<LibraryIdentityArgs, LibraryItem | null>("get_library_item"),
  save: defineCommand<SaveLibraryItemArgs, LibraryItem>("save_library_item"),
  remove: defineCommand<LibraryIdentityArgs, void>("remove_library_item"),
  has: defineCommand<LibraryIdentityArgs, boolean>("has_library_item"),
  removeIfPlanned: defineCommand<LibraryIdentityArgs, boolean>("remove_planned_library_item"),
} as const;
