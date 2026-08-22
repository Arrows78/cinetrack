import type { LibraryItem, MediaType, MediaSummary } from "@/types/media";

const libraryKey = (mediaId: number, mediaType: MediaType) => `${mediaType}:${mediaId}`;

// Stable reference so `library` doesn't change identity on every render
// while libraryQuery.data is still undefined (avoids re-triggering the
// useMemo hooks below on each render).
export const EMPTY_LIBRARY: LibraryItem[] = [];

export function buildLibraryKeySet(library: LibraryItem[]): Set<string> {
  return new Set(library.map((item) => libraryKey(item.mediaId, item.mediaType)));
}

export function isInLibrary(item: { mediaId: number; mediaType: MediaType }, keySet: Set<string>): boolean {
  return keySet.has(libraryKey(item.mediaId, item.mediaType));
}

/** Filter out items already in the user's library and cap the result set. */
export function filterAvailableItems(results: MediaSummary[], library: LibraryItem[], cap = 4): MediaSummary[] {
  if (results.length === 0) return [];
  const keySet = buildLibraryKeySet(library);
  return results.filter((item) => !isInLibrary({ mediaId: item.id, mediaType: item.mediaType }, keySet)).slice(0, cap);
}

export function buildCompletedKeySet(library: LibraryItem[]): Set<string> {
  return new Set(
    library.filter((item) => item.status === "completed").map((item) => libraryKey(item.mediaId, item.mediaType))
  );
}

/**
 * Backs the persistent "Hide watched" toggle on Discover-style surfaces
 * (home catalogue rails) and Watch Tonight — README's DISCOVERY roadmap
 * item. "Watched" mirrors every other rail in this codebase: a library
 * item's own `status === "completed"`, not a separate per-title
 * is_movie_seen check (see collection-progress.ts's statusFor for the same
 * reasoning). A no-op (returns `items` unchanged) when the toggle is off,
 * so callers can unconditionally run their results through this.
 */
export function filterHiddenIfWatched<T extends MediaSummary>(
  items: T[],
  library: LibraryItem[],
  hideWatched: boolean
): T[] {
  if (!hideWatched || items.length === 0) return items;
  const completedKeySet = buildCompletedKeySet(library);
  return items.filter((item) => !isInLibrary({ mediaId: item.id, mediaType: item.mediaType }, completedKeySet));
}
