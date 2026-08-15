import type { LibraryItem, MediaType } from "@/types/media";

const libraryKey = (mediaId: number, mediaType: MediaType) => `${mediaType}:${mediaId}`;

export function buildLibraryKeySet(library: LibraryItem[]): Set<string> {
  return new Set(library.map((item) => libraryKey(item.mediaId, item.mediaType)));
}

export function isInLibrary(item: { mediaId: number; mediaType: MediaType }, keySet: Set<string>): boolean {
  return keySet.has(libraryKey(item.mediaId, item.mediaType));
}
