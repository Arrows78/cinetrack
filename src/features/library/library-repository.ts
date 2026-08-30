import {
  libraryCommands,
  type LibraryFilterParams,
  type LibraryListParams,
  type LibraryMediaKey,
  type LibraryPage,
  type LibraryPatch,
  type LibraryStatusCounts,
} from "@/features/library/library-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { LibraryItem, MediaSummary } from "@/types/media";

export type {
  LibraryPatch,
  LibraryListParams,
  LibraryPage,
  LibraryPageSort,
  LibraryFilterParams,
  LibraryMediaKey,
  LibraryStatusCounts,
} from "@/features/library/library-commands";

// The status/startedAt/completedAt business rules, the save transaction
// and active-profile resolution now live in Rust (see
// src-tauri/src/library/) — this repository is a thin invoke()
// wrapper.
export const libraryRepository = {
  // Kept for the /movies and /series "My list" tabs' own watch-progress
  // bucketing (in-progress/not-started/finished), which genuinely needs
  // the complete profile-scoped set. Every other former full-read consumer
  // (recommendation rails, smart-list evaluation, stats/tracking
  // aggregates) now has its own targeted method below instead.
  async list(): Promise<LibraryItem[]> {
    return invokeTypedCommand(libraryCommands.list);
  },

  // Cursor-paginated, server-filtered/sorted counterpart to list() — the
  // Library page's own scrollable grid/list.
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

  // A membership set only (no rows) — for "which of these TMDB results am
  // I already tracking" style filters (a rail's exclude-if-owned check, a
  // calendar entry's mine-vs-discovery flip).
  async listMediaKeys(): Promise<LibraryMediaKey[]> {
    return invokeTypedCommand(libraryCommands.listMediaKeys);
  },

  // Batch counterpart to get() — a caller-bounded set of specific
  // (mediaId, mediaType) pairs (a TMDB collection's parts, one custom
  // list's items), not "give me everything."
  async getItemsByKeys(keys: LibraryMediaKey[]): Promise<LibraryItem[]> {
    return invokeTypedCommand(libraryCommands.getItemsByKeys, { keys });
  },

  async statusCounts(): Promise<LibraryStatusCounts> {
    return invokeTypedCommand(libraryCommands.statusCounts);
  },

  // Watch Tonight's candidate pool: up to `limit` most-recently-touched
  // planned items of one media type.
  async plannedCandidates(mediaType: MediaSummary["mediaType"], limit: number): Promise<LibraryItem[]> {
    return invokeTypedCommand(libraryCommands.plannedCandidates, { mediaType, limit });
  },

  // The "people you watch most" rail's candidate pool: up to `limit`
  // most-recently-completed items, optionally of one media type.
  async completedCandidates(mediaType: MediaSummary["mediaType"] | undefined, limit: number): Promise<LibraryItem[]> {
    return invokeTypedCommand(libraryCommands.completedCandidates, { mediaType, limit });
  },

  // The "because you liked" rail's single seed item, chosen server-side by
  // a 4-tier priority waterfall — see get_best_recommendation_seed_impl in
  // src-tauri/src/library/queries.rs.
  async bestRecommendationSeed(): Promise<LibraryItem | null> {
    return invokeTypedCommand(libraryCommands.bestRecommendationSeed);
  },

  // Ids matching a narrow set of purely-relational filters (status/media
  // type/genre/rating) — never a full rule DSL. A caller with a richer
  // rule set (e.g. a SmartList's provider/episode-waiting/runtime rules)
  // applies those as a client-side post-filter over this already-smaller
  // candidate set.
  async idsMatchingFilters(filters: LibraryFilterParams): Promise<LibraryMediaKey[]> {
    return invokeTypedCommand(libraryCommands.idsMatchingFilters, { filters });
  },
};
