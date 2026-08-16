import { useMemo } from "react";
import { useLibrary } from "@/features/library/use-library";
import { buildLibraryKeySet, isInLibrary } from "@/features/library/library-set";
import { useRecommendations } from "@/features/media/use-discovery";
import type { LibraryItem, MediaSummary } from "@/types/media";

// Stable reference so `library` doesn't change identity on every render
// while libraryQuery.data is still undefined (avoids re-triggering the
// useMemo hooks below on each render).
const EMPTY_LIBRARY: LibraryItem[] = [];

const byMostRecent = (a: LibraryItem, b: LibraryItem) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

// Picks the strongest positive signal available in the user's library,
// falling back through weaker-but-still-real tiers instead of requiring the
// single strongest one. A brand-new library is almost always "planned"
// only — requiring an explicit rating on top of "completed" (the original,
// stricter version of this function) meant the rail would stay hidden for
// most real usage far longer than it needed to. Exported for isolated unit
// testing.
export function pickBestSeed(library: LibraryItem[]): LibraryItem | null {
  // 1. An explicit rated opinion on a title actually finished — the
  //    strongest possible signal.
  const rated = library.filter((item) => item.status === "completed" && item.userRating != null);
  if (rated.length > 0) {
    return [...rated].sort((a, b) => {
      const byRating = (b.userRating ?? 0) - (a.userRating ?? 0);
      return byRating !== 0 ? byRating : (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
    })[0]!;
  }

  // 2. Explicitly favourited — a real taste signal even before (or without)
  //    having watched it.
  const favourited = library.filter((item) => item.favourite);
  if (favourited.length > 0) return [...favourited].sort(byMostRecent)[0]!;

  // 3. Completed but never rated — still a real "I finished this" signal.
  const completed = library.filter((item) => item.status === "completed");
  if (completed.length > 0) {
    return [...completed].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0]!;
  }

  // 4. Actively engaged with right now.
  const inProgress = library.filter((item) => item.status === "watching" || item.status === "rewatching");
  if (inProgress.length > 0) return [...inProgress].sort(byMostRecent)[0]!;

  return null;
}

export function useBecauseYouLiked() {
  const libraryQuery = useLibrary();
  const library = libraryQuery.data ?? EMPTY_LIBRARY;
  const seed = useMemo(() => pickBestSeed(library), [library]);

  const recommendationsQuery = useRecommendations(seed?.mediaType ?? "movie", seed?.mediaId ?? Number.NaN);

  // Capped like the other "For You" rails — this is a serendipitous
  // suggestion, not a browsable catalogue page, so it shouldn't render
  // TMDB's full ~20-result page.
  const items = useMemo<MediaSummary[]>(() => {
    const results = recommendationsQuery.data?.results ?? [];
    if (results.length === 0) return [];
    const keySet = buildLibraryKeySet(library);
    return results.filter((item) => !isInLibrary({ mediaId: item.id, mediaType: item.mediaType }, keySet)).slice(0, 8);
  }, [recommendationsQuery.data, library]);

  return { seedTitle: seed?.title ?? null, items, isLoading: Boolean(seed) && recommendationsQuery.isLoading };
}
