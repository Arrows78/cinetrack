import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMovieSeen } from "@/features/progress/use-progress";
import { useAddToLibraryToggle } from "@/features/library/use-add-to-library-toggle";
import { cn } from "@/shared/lib/cn";
import { MEDIA_POSTER_SCRIM } from "@/shared/constants/decorative-gradients";
import { buildTmdbImageUrl, buildTmdbPosterSrcSet, formatRating } from "@/shared/utils/format";
import { progressBarTone } from "@/shared/utils/series-status";
import type { MediaSummary } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";

export interface MediaCardProgress {
  watched: number;
  total: number;
  /** The series' own TMDB production status — see progressBarTone(). Movies never set this. */
  seriesStatus?: string | null;
}

// Stop the click from also activating the card's wrapping <Link> — these
// buttons live inside it so they can overlay the poster, not so navigating
// away is also part of "toggle library"/"toggle seen".
function stopCardNavigation(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

const quickActionButtonClassName =
  "flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-transform duration-base hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

function AddToLibraryQuickAction({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const { isInLibrary, toggle, isMutating, confirmingForceRemove, setConfirmingForceRemove, confirmForceRemove } =
    useAddToLibraryToggle(media);

  return (
    <>
      <button
        type="button"
        aria-label={isInLibrary ? t("media.inLibrary") : t("media.addToLibrary")}
        aria-pressed={isInLibrary}
        disabled={isMutating}
        onClick={(event) => {
          stopCardNavigation(event);
          void toggle();
        }}
        className={quickActionButtonClassName}
      >
        {isInLibrary ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
      </button>
      <ConfirmDialog
        open={confirmingForceRemove}
        onOpenChange={setConfirmingForceRemove}
        title={t("library.removeConfirmTitle")}
        description={t("library.removeConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmForceRemove}
      />
    </>
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
      <AddToLibraryQuickAction media={media} />
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
  const tone = showProgress ? progressBarTone(progress.watched, progress.total, progress.seriesStatus) : null;
  const barPercent = showProgress ? Math.min(100, Math.round((progress.watched / progress.total) * 100)) : 0;
  // A movie has no fractional progress to show (see MediaCardQuickActions'
  // comment: watched/unwatched is its whole state) — alreadySeen alone
  // gets it the same finished bar a fully-ended series would.
  const showFinishedBar = !showProgress && alreadySeen;

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

        {/* Type chip — no separate "Seen" badge: the finished bottom bar
            (bg-success, full width) already says that, and showing both
            was a redundant, duplicated signal for the exact same state. */}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <Badge
            variant={media.mediaType === "movie" ? "movie" : "series"}
            className="px-2.5 py-0.5 text-overline font-semibold uppercase backdrop-blur-sm transition-all duration-base"
          >
            {media.mediaType === "movie" ? t("media.movie") : t("media.series")}
          </Badge>
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

        {/* TV Time-style progress bar — primary while still catching up;
            green once every released episode is watched. caughtUp (a
            renewed/returning show) gets a lighter shade of that same green
            instead of a separate color/badge — "done for now" without
            claiming the show itself is over. */}
        {showProgress ? (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.watched}
            aria-label={t("media.episodes")}
            className="absolute inset-x-0 bottom-0 h-2 bg-black/40"
          >
            <div
              className={cn(
                "h-full shadow-sm transition-all duration-medium",
                tone === "finished" ? "bg-success" : tone === "caughtUp" ? "bg-success/60" : "bg-primary"
              )}
              style={{ width: `${barPercent}%` }}
            />
          </div>
        ) : showFinishedBar ? (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={100}
            aria-label={t("media.alreadySeen")}
            className="absolute inset-x-0 bottom-0 h-2 bg-success shadow-sm"
          />
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
