import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMovieSeen } from "@/features/progress/use-progress";
import { useIsInWatchlist, useWatchlist } from "@/features/watchlist/use-watchlist";
import { newUuid } from "@/shared/lib/id";
import { cn } from "@/shared/lib/cn";
import { MEDIA_POSTER_SCRIM } from "@/shared/constants/decorative-gradients";
import { buildTmdbImageUrl, buildTmdbPosterSrcSet, formatRating } from "@/shared/utils/format";
import type { MediaSummary, WatchlistItem } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";

export interface MediaCardProgress {
  watched: number;
  total: number;
}

// Stop the click from also activating the card's wrapping <Link> — these
// buttons live inside it so they can overlay the poster, not so navigating
// away is also part of "toggle watchlist"/"toggle seen".
function stopCardNavigation(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

const quickActionButtonClassName =
  "flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-transform duration-base hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

function WatchlistQuickAction({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const { data: isInWatchlist } = useIsInWatchlist(media.id, media.mediaType);
  const { addToWatchlist, removeFromWatchlist, isMutating } = useWatchlist();

  const toggle = async () => {
    if (isInWatchlist) {
      await removeFromWatchlist({ mediaId: media.id, mediaType: media.mediaType });
      return;
    }
    const now = new Date().toISOString();
    const payload: WatchlistItem = {
      id: newUuid(),
      mediaId: media.id,
      mediaType: media.mediaType,
      title: media.title,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      year: media.year,
      rating: media.rating,
      createdAt: now,
      updatedAt: now,
    };
    await addToWatchlist(payload);
  };

  return (
    <button
      type="button"
      aria-label={isInWatchlist ? t("media.inWatchlist") : t("media.addToWatchlist")}
      aria-pressed={Boolean(isInWatchlist)}
      disabled={isMutating}
      onClick={(event) => {
        stopCardNavigation(event);
        void toggle();
      }}
      className={quickActionButtonClassName}
    >
      {isInWatchlist ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
    </button>
  );
}

function SeenQuickAction({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const seenQuery = useMovieSeen(media.id);

  return (
    <button
      type="button"
      aria-label={seenQuery.data ? t("media.markUnseen") : t("media.markSeen")}
      aria-pressed={Boolean(seenQuery.data)}
      disabled={seenQuery.isSaving}
      onClick={(event) => {
        stopCardNavigation(event);
        void seenQuery.toggleMovieSeen({ movie: media, watched: !seenQuery.data });
      }}
      className={cn(quickActionButtonClassName, seenQuery.data && "bg-success text-success-foreground")}
    >
      <Check className="size-4" />
    </button>
  );
}

// Movies only: marking a series "seen" means toggling every episode across
// every season (see SeenToggle's use on series-detail-page.tsx), which needs
// that series' full season/episode list loaded — too heavy to fetch just for
// a grid-card hover action. Movies are a single cheap toggle either way.
function MediaCardQuickActions({ media }: { media: MediaSummary }) {
  return (
    <div className="absolute right-3 top-14 flex flex-col gap-2 opacity-0 transition-opacity duration-base group-hover:opacity-100 group-focus-within:opacity-100">
      <WatchlistQuickAction media={media} />
      {media.mediaType === "movie" ? <SeenQuickAction media={media} /> : null}
    </div>
  );
}

function MediaCardInner({
  media,
  progress,
  alreadySeen,
}: {
  media: MediaSummary;
  progress?: MediaCardProgress;
  alreadySeen?: boolean;
}) {
  const { t } = useTranslation();
  const image = buildTmdbImageUrl(media.posterPath, "w500") ?? fallbackPoster;
  const srcSet = buildTmdbPosterSrcSet(media.posterPath);
  const showProgress = progress !== undefined && progress.total > 0;
  const complete = showProgress && progress.watched >= progress.total;

  return (
    <div className="relative overflow-hidden rounded-card">
      {/* Poster image */}
      <div className="relative aspect-[2/3] overflow-hidden">
        <img
          src={image}
          srcSet={srcSet}
          sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-slower ease-out group-hover:scale-[1.07]"
        />

        {/* Cinematic gradient overlay */}
        <div className="absolute inset-0" style={{ background: MEDIA_POSTER_SCRIM }} />

        {/* Shine effect on hover */}
        <div className="absolute inset-0 overflow-hidden opacity-0 transition-opacity duration-medium group-hover:opacity-100">
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Top: rating badge */}
        <div
          aria-label={t("media.ratingLabel", { rating: formatRating(media.rating) })}
          className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-transform duration-base group-hover:scale-110"
        >
          <span className="text-rating" aria-hidden="true">
            ★
          </span>
          {formatRating(media.rating)}
        </div>

        <MediaCardQuickActions media={media} />

        {/* Type chip + already-seen badge */}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <Badge
            variant={media.mediaType === "movie" ? "movie" : "series"}
            className="px-2.5 py-0.5 text-overline font-semibold uppercase backdrop-blur-sm transition-all duration-base"
          >
            {media.mediaType === "movie" ? t("media.movie") : t("media.series")}
          </Badge>
          {alreadySeen ? (
            <Badge
              variant="success"
              className="gap-1 px-2.5 py-0.5 text-overline font-semibold uppercase backdrop-blur-sm transition-all duration-base"
            >
              <Check className="size-3" aria-hidden="true" />
              {t("media.alreadySeen")}
            </Badge>
          ) : null}
        </div>

        {/* Bottom: title + year + genre */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-display line-clamp-2 text-base font-bold leading-tight text-card-foreground md:text-lg transition-all duration-base group-hover:text-primary/90">
            {media.title}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-caption font-medium text-white/60">{media.year ?? t("media.unknownYear")}</p>
            {media.genres[0] && (
              <>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <p className="truncate text-caption font-medium text-white/60">{media.genres[0]}</p>
              </>
            )}
            {showProgress ? (
              <>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <p className="text-caption font-medium tabular-nums text-white/60">
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
              className={cn("h-full transition-all duration-medium", complete ? "bg-success" : "bg-primary")}
              style={{ width: `${Math.min(100, Math.round((progress.watched / progress.total) * 100))}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MediaCard({
  media,
  progress,
  alreadySeen,
}: {
  media: MediaSummary;
  progress?: MediaCardProgress;
  alreadySeen?: boolean;
}) {
  return (
    <motion.div
      className="group"
      whileHover={{ y: -5, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      {media.mediaType === "movie" ? (
        <Link
          to="/movies/$movieId"
          params={{ movieId: String(media.id) }}
          className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MediaCardInner media={media} progress={progress} alreadySeen={alreadySeen} />
        </Link>
      ) : (
        <Link
          to="/series/$seriesId"
          params={{ seriesId: String(media.id) }}
          className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MediaCardInner media={media} progress={progress} alreadySeen={alreadySeen} />
        </Link>
      )}
    </motion.div>
  );
}
