import { useEffect } from "react";
import { useLibraryItem, useRefreshLibraryCatalogMetadata } from "@/features/library/use-library";
import type { MediaSummary } from "@/types/media";

/**
 * Silent side effect, no markup: corrects an existing library entry's
 * cached year/rating against this page's freshly-fetched TMDB data whenever
 * they've drifted — a library row can end up with a stale or null year/
 * rating when it was first created by a codepath that only had partial
 * media info in hand (see use-watch-next.ts's useMarkWatchNext). A no-op if
 * this title isn't in the library at all.
 */
export function CatalogMetadataSync({ media }: { media: MediaSummary }) {
  const libraryItem = useLibraryItem(media);
  const refreshCatalogMetadata = useRefreshLibraryCatalogMetadata();
  const item = libraryItem.data;

  useEffect(() => {
    if (!item) return;
    if (item.year === media.year && item.rating === media.rating) return;
    void refreshCatalogMetadata({
      mediaId: media.id,
      mediaType: media.mediaType,
      year: media.year ?? null,
      rating: media.rating ?? null,
    });
  }, [item, media.id, media.mediaType, media.year, media.rating, refreshCatalogMetadata]);

  return null;
}
