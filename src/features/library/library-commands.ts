import { defineCommand } from "@/shared/lib/invoke";
import type {
  LibraryFilterParams,
  LibraryItem,
  LibraryListParams,
  LibraryMediaKey,
  LibraryPage,
  LibrarySort,
  LibraryStatus,
  LibraryStatusCounts,
  MediaSummary,
} from "@/types/media";

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

type ListLibraryArgs = { mediaType: MediaSummary["mediaType"] | null };
type GetItemsByKeysArgs = { keys: LibraryMediaKey[] };
type PlannedCandidatesArgs = { mediaType: MediaSummary["mediaType"]; limit: number };
type CompletedCandidatesArgs = { mediaType?: MediaSummary["mediaType"]; limit: number };
type IdsMatchingFiltersArgs = { filters: LibraryFilterParams };

export type { LibraryListParams, LibraryPage, LibrarySort, LibraryFilterParams, LibraryMediaKey, LibraryStatusCounts };
export type LibraryPageSort = LibrarySort;

export const libraryCommands = {
  list: defineCommand<ListLibraryArgs, LibraryItem[]>("list_library"),
  listPage: defineCommand<LibraryListParams, LibraryPage>("list_library_page"),
  get: defineCommand<LibraryIdentityArgs, LibraryItem | null>("get_library_item"),
  save: defineCommand<SaveLibraryItemArgs, LibraryItem>("save_library_item"),
  remove: defineCommand<LibraryIdentityArgs, void>("remove_library_item"),
  has: defineCommand<LibraryIdentityArgs, boolean>("has_library_item"),
  removeIfPlanned: defineCommand<LibraryIdentityArgs, boolean>("remove_planned_library_item"),
  listMediaKeys: defineCommand<undefined, LibraryMediaKey[]>("list_library_media_keys"),
  getItemsByKeys: defineCommand<GetItemsByKeysArgs, LibraryItem[]>("get_library_items_by_keys"),
  statusCounts: defineCommand<undefined, LibraryStatusCounts>("get_library_status_counts"),
  plannedCandidates: defineCommand<PlannedCandidatesArgs, LibraryItem[]>("list_planned_library_candidates"),
  completedCandidates: defineCommand<CompletedCandidatesArgs, LibraryItem[]>("list_completed_library_candidates"),
  bestRecommendationSeed: defineCommand<undefined, LibraryItem | null>("get_best_recommendation_seed"),
  idsMatchingFilters: defineCommand<IdsMatchingFiltersArgs, LibraryMediaKey[]>("list_library_ids_matching_filters"),
} as const;
