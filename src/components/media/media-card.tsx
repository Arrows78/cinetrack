import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl, formatRating } from "@/shared/utils/format";
import type { MediaSummary } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";

export interface MediaCardProgress {
  watched: number;
  total: number;
}

function MediaCardInner({ media, progress }: { media: MediaSummary; progress?: MediaCardProgress }) {
  const { t } = useTranslation();
  const image = buildTmdbImageUrl(media.posterPath, "w500") ?? fallbackPoster;
  const showProgress = progress !== undefined && progress.total > 0;
  const complete = showProgress && progress.watched >= progress.total;

  return (
    <div className="relative overflow-hidden rounded-card">
      {/* Poster image */}
      <div className="relative aspect-[2/3] overflow-hidden">
        <img
          src={image}
          alt={media.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-slower ease-out group-hover:scale-[1.07]"
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
        <div className="absolute inset-0 overflow-hidden opacity-0 transition-opacity duration-medium group-hover:opacity-100">
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Top: rating badge */}
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-transform duration-base group-hover:scale-110">
          <span className="text-amber-400">★</span>
          {formatRating(media.rating)}
        </div>

        {/* Type chip */}
        <div className="absolute left-3 top-3">
          <Badge
            variant={media.mediaType === "movie" ? "movie-overlay" : "series-overlay"}
            className="px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm transition-all duration-base"
          >
            {media.mediaType === "movie" ? t("nav.movies") : t("nav.series")}
          </Badge>
        </div>

        {/* Bottom: title + year + genre */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-display line-clamp-2 text-base font-bold leading-tight text-card-foreground md:text-lg transition-all duration-base group-hover:text-primary/90">
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
            {showProgress ? (
              <>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <p className="text-[11px] font-medium tabular-nums text-white/60">
                  {progress.watched}/{progress.total}
                </p>
              </>
            ) : null}
          </div>
        </div>

        {/* TV Time-style progress bar */}
        {showProgress ? (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.watched}
            aria-label={t("media.episodes")}
            className="absolute inset-x-0 bottom-0 h-1 bg-white/15"
          >
            <div
              className={cn("h-full transition-all duration-medium", complete ? "bg-emerald-500" : "bg-primary")}
              style={{ width: `${Math.min(100, Math.round((progress.watched / progress.total) * 100))}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MediaCard({ media, progress }: { media: MediaSummary; progress?: MediaCardProgress }) {
  return (
    <motion.div
      className="group"
      whileHover={{ y: -5, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      {media.mediaType === "movie" ? (
        <Link to="/movies/$movieId" params={{ movieId: String(media.id) }}>
          <MediaCardInner media={media} progress={progress} />
        </Link>
      ) : (
        <Link to="/series/$seriesId" params={{ seriesId: String(media.id) }}>
          <MediaCardInner media={media} progress={progress} />
        </Link>
      )}
    </motion.div>
  );
}
