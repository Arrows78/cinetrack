import { useMemo } from "react";
import { useLibrary } from "@/features/library/use-library";
import { buildLibraryKeySet, isInLibrary } from "@/features/library/library-set";
import { useSearch } from "@/features/media/use-search";
import { useMergedGenres, type MergedGenre } from "@/features/media/use-merged-genres";
import { useStats } from "@/features/stats/use-stats";
import type { LibraryItem, LibraryStats, MediaSummary } from "@/types/media";

// Stable reference so `library` doesn't change identity on every render
// while libraryQuery.data is still undefined (avoids re-triggering the
// useMemo hook below on each render).
const EMPTY_LIBRARY: LibraryItem[] = [];

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
  const libraryQuery = useLibrary();
  const mergedGenres = useMergedGenres();
  const library = libraryQuery.data ?? EMPTY_LIBRARY;

  const genre = useMemo(
    () => pickTopGenre(statsQuery.data?.favouriteGenres ?? [], mergedGenres),
    [statsQuery.data, mergedGenres]
  );

  const searchQuery = useSearch("", "all", {
    genreMovie: genre?.movieId ? String(genre.movieId) : undefined,
    genreSeries: genre?.seriesId ? String(genre.seriesId) : undefined,
  });

  const items = useMemo<MediaSummary[]>(() => {
    if (!genre || searchQuery.items.length === 0) return [];
    const keySet = buildLibraryKeySet(library);
    return searchQuery.items.filter((item) => !isInLibrary({ mediaId: item.id, mediaType: item.mediaType }, keySet));
  }, [genre, searchQuery.items, library]);

  return { genre, items, isLoading: Boolean(genre) && searchQuery.isLoading };
}
