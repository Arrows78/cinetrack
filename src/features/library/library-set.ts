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
