import {
  libraryCommands,
  type LibraryListParams,
  type LibraryPage,
  type LibraryPatch,
} from "@/features/library/library-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { LibraryItem, MediaSummary } from "@/types/media";

export type {
  LibraryPatch,
  LibraryListParams,
  LibraryPage,
  LibraryPageSort,
} from "@/features/library/library-commands";

// The status/startedAt/completedAt business rules, the save transaction
// and active-profile resolution now live in Rust (see
// src-tauri/src/library/) — this repository is a thin invoke()
// wrapper.
export const libraryRepository = {
  async list(): Promise<LibraryItem[]> {
    return invokeTypedCommand(libraryCommands.list);
  },

  // Cursor-paginated, server-filtered/sorted counterpart to list() — see
  // use-library.ts's useLibraryPage for the one consumer that actually
  // needs this (the Library page's own scrollable grid/list). Every other
  // useLibrary() caller does a bounded aggregate over the whole (still
  // safety-capped) array and has no reason to move to this.
  async listPage(params: LibraryListParams): Promise<LibraryPage> {
    return invokeTypedCommand(libraryCommands.listPage, params);
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
  // never one with real progress — see remove_if_planned_impl in src-tauri/src/library/repository.rs.
  async removeIfPlanned(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<boolean> {
    return invokeTypedCommand(libraryCommands.removeIfPlanned, { mediaId, mediaType });
  },
};
