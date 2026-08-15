import { useMemo } from "react";
import { useLibrary } from "@/features/library/use-library";
import { buildLibraryKeySet, isInLibrary } from "@/features/library/library-set";
import { useRecommendations } from "@/features/media/use-discovery";
import type { LibraryItem, MediaSummary } from "@/types/media";

// Stable reference so `library` doesn't change identity on every render
// while libraryQuery.data is still undefined (avoids re-triggering the
// useMemo hooks below on each render).
const EMPTY_LIBRARY: LibraryItem[] = [];

// Picks the strongest positive signal in the user's library: an explicitly
// rated, fully completed title. Ties break on the most recently completed —
// deliberately ignores "watching"/"planned" items, which aren't a completed
// opinion yet. Exported for isolated unit testing.
export function pickBestSeed(library: LibraryItem[]): LibraryItem | null {
  const rated = library.filter((item) => item.status === "completed" && item.userRating != null);
  if (rated.length === 0) return null;

  const sorted = [...rated].sort((a, b) => {
    const byRating = (b.userRating ?? 0) - (a.userRating ?? 0);
    if (byRating !== 0) return byRating;
    return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
  });
  return sorted[0] ?? null;
}

export function useBecauseYouLiked() {
  const libraryQuery = useLibrary();
  const library = libraryQuery.data ?? EMPTY_LIBRARY;
  const seed = useMemo(() => pickBestSeed(library), [library]);

  const recommendationsQuery = useRecommendations(seed?.mediaType ?? "movie", seed?.mediaId ?? Number.NaN);

  const items = useMemo<MediaSummary[]>(() => {
    const results = recommendationsQuery.data?.results ?? [];
    if (results.length === 0) return [];
    const keySet = buildLibraryKeySet(library);
    return results.filter((item) => !isInLibrary({ mediaId: item.id, mediaType: item.mediaType }, keySet));
  }, [recommendationsQuery.data, library]);

  return { seedTitle: seed?.title ?? null, items, isLoading: Boolean(seed) && recommendationsQuery.isLoading };
}
