import { useTranslation } from "react-i18next";
import { Clapperboard, Film, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  AUTH_BACKDROP_TILE_GRADIENTS,
  FILM_SPROCKET_PATTERN,
  MEDIA_POSTER_SCRIM,
} from "@/shared/constants/decorative-gradients";
import { formatRating } from "@/shared/utils/format";

// Purely decorative, static content — each tile stands in for a fictional
// film/series poster (title, genre, rating), so the stage reads as "movie
// posters" rather than an abstract mood board. Kept fully offline/local
// (no TMDB fetch): the sign-in screen renders before any session exists,
// and bundling real poster art would raise its own licensing questions —
// so these stay invented rather than real titles. Nine entries, one per
// genre, to fill a 3x3 grid without a repeated genre chip.
const BACKDROP_TILES = [
  { titleKey: "auth.backdrop.midnight", genreKey: "auth.backdrop.genres.thriller", rating: 7.8 },
  { titleKey: "auth.backdrop.redHorizon", genreKey: "auth.backdrop.genres.action", rating: 8.1 },
  { titleKey: "auth.backdrop.theVoyage", genreKey: "auth.backdrop.genres.drama", rating: 7.4 },
  { titleKey: "auth.backdrop.neonCity", genreKey: "auth.backdrop.genres.sciFi", rating: 8.6 },
  { titleKey: "auth.backdrop.theArchive", genreKey: "auth.backdrop.genres.mystery", rating: 7.2 },
  { titleKey: "auth.backdrop.lastSignal", genreKey: "auth.backdrop.genres.suspense", rating: 8.0 },
  { titleKey: "auth.backdrop.wildNorth", genreKey: "auth.backdrop.genres.adventure", rating: 7.6 },
  { titleKey: "auth.backdrop.afterglow", genreKey: "auth.backdrop.genres.romance", rating: 7.0 },
  { titleKey: "auth.backdrop.dust", genreKey: "auth.backdrop.genres.western", rating: 7.9 },
] as const;

const TILE_ICONS: readonly LucideIcon[] = [Clapperboard, Play, Film];
const BULB_COUNT = 9;

function Bulb({ lit }: { lit: boolean }) {
  return <span className={cn("size-1.5 rounded-full", lit ? "bg-rating" : "bg-rating/30")} />;
}

function BulbColumn({ side, className }: { side: "left" | "right"; className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-y-4 z-10 flex w-3 flex-col items-center justify-between",
        side === "left" ? "left-2" : "right-2",
        className
      )}
    >
      {Array.from({ length: BULB_COUNT }, (_, index) => (
        <Bulb key={index} lit={index % 3 === 0} />
      ))}
    </div>
  );
}

function BulbRow({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-x-3 top-2 z-10 flex items-center justify-between", className)}>
      {Array.from({ length: BULB_COUNT }, (_, index) => (
        <Bulb key={index} lit={index % 3 === 0} />
      ))}
    </div>
  );
}

export function AuthBackdrop() {
  const { t } = useTranslation();

  return (
    <div className="relative h-full w-full overflow-hidden bg-black" aria-hidden="true">
      <BulbRow className="lg:hidden" />
      <BulbColumn side="left" className="hidden lg:flex" />
      <BulbColumn side="right" className="hidden lg:flex" />

      <div className="grid h-full grid-cols-3 grid-rows-3 gap-1 px-3 pb-2 pt-7 lg:px-9 lg:py-3">
        {BACKDROP_TILES.map((tile, index) => {
          const Icon = TILE_ICONS[index % TILE_ICONS.length] ?? Clapperboard;
          return (
            <div
              key={tile.titleKey}
              className="relative overflow-hidden rounded-sm border border-white/10"
              style={{ background: AUTH_BACKDROP_TILE_GRADIENTS[index] }}
            >
              <div className="absolute inset-x-0 top-0 h-2" style={{ backgroundImage: FILM_SPROCKET_PATTERN }} />
              <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundImage: FILM_SPROCKET_PATTERN }} />
              <div className="absolute inset-0 flex items-center justify-center opacity-15">
                <Icon className="h-7 w-7 text-white" />
              </div>
              <div className="absolute inset-0" style={{ background: MEDIA_POSTER_SCRIM }} />
              <div className="absolute inset-x-2 bottom-3">
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
      </div>
    </div>
  );
}
