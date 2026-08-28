import { libraryCommands, type LibraryPatch } from "@/features/library/library-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { LibraryItem, MediaSummary } from "@/types/media";

export type { LibraryPatch } from "@/features/library/library-commands";

// The status/startedAt/completedAt business rules, the save transaction
// and active-profile resolution now live in Rust (see
// src-tauri/src/commands/library.rs) — this repository is a thin invoke()
// wrapper.
export const libraryRepository = {
  async list(): Promise<LibraryItem[]> {
    return invokeTypedCommand(libraryCommands.list);
  },

  async get(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<LibraryItem | null> {
    return invokeTypedCommand(libraryCommands.get, { mediaId, mediaType });
  },

  async save(media: MediaSummary, patch: LibraryPatch = {}): Promise<LibraryItem> {
    return invokeTypedCommand(libraryCommands.save, { media, patch });
  },

  async remove(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<void> {
    await invokeTypedCommand(libraryCommands.remove, { mediaId, mediaType });
  },

  async has(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<boolean> {
    return invokeTypedCommand(libraryCommands.has, { mediaId, mediaType });
  },

  // Guarded remove used by the quick "add to library" toggle: only removes
  // (and returns true for) an item still in the default `planned` status,
  // never one with real progress — see remove_if_planned_impl in library.rs.
  async removeIfPlanned(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<boolean> {
    return invokeTypedCommand(libraryCommands.removeIfPlanned, { mediaId, mediaType });
  },
};
