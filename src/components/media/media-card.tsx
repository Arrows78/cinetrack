import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl, formatRating } from "@/shared/utils/format";
import type { MediaSummary } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";

function MediaCardInner({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const image = buildTmdbImageUrl(media.posterPath, "w500") ?? fallbackPoster;

  return (
    <div className="relative overflow-hidden rounded-[24px]">
      {/* Poster image */}
      <div className="relative aspect-[2/3] overflow-hidden">
        <img
          src={image}
          alt={media.title}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]"
        />

        {/* Cinematic gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)",
          }}
        />

        {/* Shine effect on hover */}
        <div className="absolute inset-0 overflow-hidden opacity-0 transition-opacity duration-500 group-hover:opacity-100">
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Top: rating badge */}
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
          <span className="text-amber-400">★</span>
          {formatRating(media.rating)}
        </div>

        {/* Type chip */}
        <div className="absolute left-3 top-3">
          <div
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm transition-all duration-300",
              media.mediaType === "movie"
                ? "bg-primary/85 text-primary-foreground"
                : "bg-black/50 text-white/90 ring-1 ring-white/20"
            )}
          >
            {media.mediaType === "movie" ? t("nav.movies") : t("nav.series")}
          </div>
        </div>

        {/* Bottom: title + year + genre */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-display line-clamp-2 text-base font-bold leading-tight text-card-foreground md:text-lg transition-all duration-300 group-hover:text-primary/90">
            {media.title}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-[11px] font-medium tracking-wide text-white/60">
              {media.year ?? t("media.unknownYear")}
            </p>
            {media.genres[0] && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <p className="truncate text-[11px] font-medium text-white/60">{media.genres[0]}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MediaCard({ media }: { media: MediaSummary }) {
  return (
    <motion.div
      className="group"
      whileHover={{ y: -5, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      {media.mediaType === "movie" ? (
        <Link to="/movies/$movieId" params={{ movieId: String(media.id) }}>
          <MediaCardInner media={media} />
        </Link>
      ) : (
        <Link to="/series/$seriesId" params={{ seriesId: String(media.id) }}>
          <MediaCardInner media={media} />
        </Link>
      )}
    </motion.div>
  );
}
