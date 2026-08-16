import { useTranslation } from "react-i18next";
import { Clapperboard, Film, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  AUTH_BACKDROP_TILE_GRADIENTS,
  AUTH_BACKDROP_TILE_SHEEN,
  MEDIA_POSTER_SCRIM,
} from "@/shared/constants/decorative-gradients";
import { formatRating } from "@/shared/utils/format";

// Purely decorative, static content — each tile stands in for a fictional
// film/series poster (title, genre, rating), so the collage reads as "movie
// posters" rather than an abstract mood board. Kept fully offline/local
// (no TMDB fetch): the sign-in screen renders before any session exists,
// and bundling real poster art would raise its own licensing questions —
// so these stay invented rather than real titles.
const BACKDROP_TILES = [
  { titleKey: "auth.backdrop.midnight", genreKey: "auth.backdrop.genres.thriller", rating: 7.8 },
  { titleKey: "auth.backdrop.redHorizon", genreKey: "auth.backdrop.genres.action", rating: 8.1 },
  { titleKey: "auth.backdrop.theVoyage", genreKey: "auth.backdrop.genres.drama", rating: 7.4 },
  { titleKey: "auth.backdrop.neonCity", genreKey: "auth.backdrop.genres.sciFi", rating: 8.6 },
  { titleKey: "auth.backdrop.theArchive", genreKey: "auth.backdrop.genres.mystery", rating: 7.2 },
  { titleKey: "auth.backdrop.lastSignal", genreKey: "auth.backdrop.genres.suspense", rating: 8.0 },
  { titleKey: "auth.backdrop.wildNorth", genreKey: "auth.backdrop.genres.adventure", rating: 7.6 },
  { titleKey: "auth.backdrop.orbit", genreKey: "auth.backdrop.genres.sciFi", rating: 8.3 },
  { titleKey: "auth.backdrop.afterglow", genreKey: "auth.backdrop.genres.romance", rating: 7.0 },
  { titleKey: "auth.backdrop.dust", genreKey: "auth.backdrop.genres.western", rating: 7.9 },
  { titleKey: "auth.backdrop.blueRoom", genreKey: "auth.backdrop.genres.drama", rating: 7.3 },
  { titleKey: "auth.backdrop.nocturne", genreKey: "auth.backdrop.genres.thriller", rating: 8.4 },
] as const;

const TILE_ICONS: readonly LucideIcon[] = [Clapperboard, Play, Film];

export function AuthBackdrop() {
  const { t } = useTranslation();

  return (
    <div
      className="absolute inset-0 grid grid-cols-3 gap-1 overflow-hidden bg-black p-1 opacity-65 sm:grid-cols-4"
      aria-hidden="true"
    >
      {BACKDROP_TILES.map((tile, index) => {
        const Icon = TILE_ICONS[index % TILE_ICONS.length] ?? Clapperboard;
        return (
          <div
            key={tile.titleKey}
            className={cn(
              "relative min-h-36 overflow-hidden rounded-sm border border-white/5",
              index % 4 === 1 && "translate-y-8",
              index % 4 === 3 && "-translate-y-5"
            )}
            style={{ background: AUTH_BACKDROP_TILE_GRADIENTS[index] }}
          >
            <div className="absolute inset-0" style={{ background: AUTH_BACKDROP_TILE_SHEEN }} />
            <div className="absolute inset-0 flex items-center justify-center opacity-15">
              <Icon className="h-8 w-8 text-white" />
            </div>
            <div className="absolute inset-0" style={{ background: MEDIA_POSTER_SCRIM }} />
            <div className="absolute inset-x-2 bottom-2">
              <p className="truncate text-overline font-semibold text-white/90">{t(tile.titleKey)}</p>
              <div className="mt-1 flex items-center gap-1.5 text-overline text-white/60">
                <span className="truncate">{t(tile.genreKey)}</span>
                <span className="h-1 w-1 shrink-0 rounded-full bg-white/40" />
                <span className="flex shrink-0 items-center gap-0.5 text-rating">★ {formatRating(tile.rating)}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/55 to-black" />
    </div>
  );
}
