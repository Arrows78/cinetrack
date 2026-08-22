import type { LibraryItem, Movie } from "@/types/media";

export type CollectionEntryStatus = "watched" | "planned" | "missing";

export interface CollectionProgressEntry {
  movie: Movie;
  status: CollectionEntryStatus;
}

export interface CollectionProgress {
  watchedCount: number;
  totalCount: number;
  entries: CollectionProgressEntry[];
}

// "watched" mirrors every other rail in this codebase (pickBestSeed,
// filterAvailableItems, …): a library item's own `status === "completed"`
// is the source of truth, kept in sync with the separate movie_seen table
// by auto_sync_status_impl (see src-tauri/src/commands/progress.rs) rather
// than re-querying is_movie_seen per collection part, which would be one
// invoke() per movie in the franchise just to render this section.
function statusFor(movie: Movie, library: LibraryItem[]): CollectionEntryStatus {
  const item = library.find((entry) => entry.mediaType === "movie" && entry.mediaId === movie.id);
  if (!item) return "missing";
  return item.status === "completed" ? "watched" : "planned";
}

/** Buckets a TMDB collection's parts against the user's library into watched/planned/missing, in the collection's own (release) order. */
export function computeCollectionProgress(parts: Movie[], library: LibraryItem[]): CollectionProgress {
  const entries = parts.map((movie) => ({ movie, status: statusFor(movie, library) }));
  return {
    watchedCount: entries.filter((entry) => entry.status === "watched").length,
    totalCount: entries.length,
    entries,
  };
}
