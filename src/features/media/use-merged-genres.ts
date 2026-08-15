import { useMemo } from "react";
import { GENRES } from "@/shared/constants/discover";

const SERIES_GENRE_ALIASES: Record<string, string> = {
  Action: "Action & Adventure",
  Adventure: "Action & Adventure",
  Fantasy: "Sci-Fi & Fantasy",
  "Science Fiction": "Sci-Fi & Fantasy",
  War: "War & Politics",
};

export interface MergedGenre {
  id: number;
  label: string;
  labelKey: string;
  icon: string;
  movieId: number;
  seriesId: number;
}

// `label` stays the stable English TMDB name used for matching/dedup/sort;
// `labelKey` is what's actually rendered.
export const useMergedGenres = () =>
  useMemo(() => {
    const seen = new Map<string, MergedGenre>();
    for (const g of GENRES.movies) {
      const seriesLabel = SERIES_GENRE_ALIASES[g.label] ?? g.label;
      const seriesMatch = GENRES.series.find((s) => s.label === seriesLabel);
      seen.set(g.label, {
        id: g.id,
        label: g.label,
        labelKey: g.labelKey,
        icon: g.icon,
        movieId: g.id,
        seriesId: seriesMatch?.id ?? 0,
      });
    }
    for (const g of GENRES.series) {
      if (!seen.has(g.label) && !Array.from(seen.values()).some((item) => item.seriesId === g.id)) {
        const movieMatch = GENRES.movies.find((m) => m.label === g.label);
        seen.set(g.label, {
          id: g.id,
          label: g.label,
          labelKey: g.labelKey,
          icon: g.icon,
          movieId: movieMatch?.id ?? 0,
          seriesId: g.id,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, []);
