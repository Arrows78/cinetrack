import type { LibraryItem, LibraryStatus, MediaSummary } from "@/types/media";
import { invokeCommand } from "@/shared/lib/invoke";

export interface LibraryPatch {
  status?: LibraryStatus;
  favourite?: boolean;
  userRating?: number | null;
  notes?: string | null;
  tags?: string[];
  rewatchCount?: number;
}

// The status/startedAt/completedAt business rules, the save transaction
// and active-profile resolution now live in Rust (see
// src-tauri/src/commands/library.rs) — this repository is a thin invoke()
// wrapper.
export const libraryRepository = {
  async list(): Promise<LibraryItem[]> {
    return invokeCommand<LibraryItem[]>("list_library");
  },

  async get(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<LibraryItem | null> {
    return invokeCommand<LibraryItem | null>("get_library_item", { mediaId, mediaType });
  },

  async save(media: MediaSummary, patch: LibraryPatch = {}): Promise<LibraryItem> {
    return invokeCommand<LibraryItem>("save_library_item", { media, patch });
  },

  async remove(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<void> {
    await invokeCommand<void>("remove_library_item", { mediaId, mediaType });
  },
};
