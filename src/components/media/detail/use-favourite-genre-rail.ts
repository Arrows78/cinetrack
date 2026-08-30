import { useMemo } from "react";
import { useLibraryMediaKeys } from "@/features/library/use-library";
import { buildKeySetFromMediaKeys, filterAvailableItemsByKeySet } from "@/shared/utils/library-set";
import { useSearch } from "@/features/media/use-search";
import { useMergedGenres, type MergedGenre } from "@/features/media/use-merged-genres";
import { useStats } from "@/features/stats/use-stats";
import type { LibraryStats, MediaSummary } from "@/types/media";

// `favouriteGenres` is already sorted desc by count — just resolve the top
// entry against the merged movie/series genre list. Exported for isolated
// unit testing.
export function pickTopGenre(
  favouriteGenres: LibraryStats["favouriteGenres"],
  merged: MergedGenre[]
): MergedGenre | null {
  const top = favouriteGenres[0];
  if (!top) return null;
  return merged.find((genre) => genre.label === top.name) ?? null;
}

export function useFavouriteGenreRail() {
  const statsQuery = useStats();
  const mediaKeysQuery = useLibraryMediaKeys();
  const mergedGenres = useMergedGenres();
  const keySet = useMemo(() => buildKeySetFromMediaKeys(mediaKeysQuery.data ?? []), [mediaKeysQuery.data]);

  const genre = useMemo(
    () => pickTopGenre(statsQuery.data?.favouriteGenres ?? [], mergedGenres),
    [statsQuery.data, mergedGenres]
  );

  const searchQuery = useSearch("", "all", {
    genreMovie: genre?.movieId ? String(genre.movieId) : undefined,
    genreSeries: genre?.seriesId ? String(genre.seriesId) : undefined,
  });

  // Capped like the sibling "Because you liked" rail — this is a
  // serendipitous suggestion, not a browsable catalogue page, so it
  // shouldn't render every paginated search result.
  const items = useMemo<MediaSummary[]>(() => {
    if (!genre || searchQuery.items.length === 0) return [];
    return filterAvailableItemsByKeySet(searchQuery.items, keySet);
  }, [genre, searchQuery.items, keySet]);

  return { genre, items, isLoading: Boolean(genre) && searchQuery.isLoading };
}
