import type { MediaType } from "@/types/media";

/**
 * The one identity a title has across the app: TMDB numbers movies and
 * series separately, so a bare id is not enough. Every set or map that joins
 * titles from different sources (library, lists, dismissals, snapshots,
 * calendar) keys on this, so a key built in one place always matches one
 * built in another.
 */
export const mediaKey = (mediaType: MediaType, mediaId: number): string => `${mediaType}:${mediaId}`;
