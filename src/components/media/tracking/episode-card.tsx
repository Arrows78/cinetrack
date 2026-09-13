import { useState } from "react";
import { Calendar, Check, Clock4, EyeOff, ImageOff, NotebookPen, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { AddWatchNoteDialog } from "@/components/media/tracking/add-watch-note-dialog";
import { RatingStar } from "@/components/media/primitives/rating-star";
import { SeenToggleButton } from "@/components/media/tracking/seen-toggle-button";
import { Badge } from "@/components/ui/badge";
import { IconTooltip } from "@/components/ui/tooltip";
import { usePreferences } from "@/features/preferences/use-preferences";
import { hasAired } from "@/features/progress/use-progress";
import { useIsTouchDevice } from "@/hooks/use-is-touch-device";
import { cn } from "@/shared/lib/cn";
import { MEDIA_POSTER_OVERLAY_CLASSNAME } from "@/shared/constants/decorative-gradients";
import { buildTmdbImageUrl, formatDate, formatEpisodeNumber, formatRating, formatRuntime } from "@/shared/utils/format";
import type { Episode } from "@/types/media";

// Drag distance (px) past which onDragEnd treats the swipe as a deliberate
// mark-seen/unseen rather than an accidental nudge while scrolling the list.
const SWIPE_TOGGLE_THRESHOLD_PX = 72;
export function EpisodeCard({
  episode,
  onToggleSeen,
  disabled,
  isLastUnwatched,
  seriesId,
  seasonNumber,
}: {
  episode: Episode;
  onToggleSeen: (note?: string) => void;
  disabled?: boolean;
  isLastUnwatched?: boolean;
  // Optional: renders the still/title block as a link to this episode's own
  // detail page. Omitted by callers that don't have both ids in scope.
  seriesId?: number;
  seasonNumber?: number;
}) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const watched = Boolean(episode.watched);
  const hidden = Boolean(preferences.data?.spoilerProtection && !watched);
  // A future/unannounced air date only blocks marking-as-watched, not the
  // reverse — an already-watched row (e.g. from a bad TMDB date correction)
  // must stay toggleable back off.
  const isUnreleased = !watched && !hasAired(episode);
  const stillUrl = buildTmdbImageUrl(episode.stillPath, "w342");

  // Swipe-to-toggle is touch-only (see useIsTouchDevice) — a mouse/trackpad
  // user already has the SeenToggleButton below, and a drag gesture on
  // those inputs would just fight text selection/scrolling for no gain.
  const isTouch = useIsTouchDevice();
  const swipeEnabled = isTouch && !disabled && !isUnreleased;
  const dragX = useMotionValue(0);
  const revealOpacity = useTransform(dragX, [-SWIPE_TOGGLE_THRESHOLD_PX, 0, SWIPE_TOGGLE_THRESHOLD_PX], [1, 0, 1]);
  const handleSwipeEnd = () => {
    if (Math.abs(dragX.get()) >= SWIPE_TOGGLE_THRESHOLD_PX) onToggleSeen();
  };

  const detailsBlock = (
    <>
      <div className="relative aspect-video h-[3.875rem] w-[6.875rem] shrink-0 overflow-hidden rounded-xl bg-muted">
        {hidden ? (
          <div className="flex h-full items-center justify-center">
            <EyeOff className="size-5 text-muted-foreground" />
          </div>
        ) : stillUrl ? (
          <img src={stillUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageOff className="size-5 text-muted-foreground" />
          </div>
        )}
        {watched ? (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/25">
            <Check className={cn("size-4", MEDIA_POSTER_OVERLAY_CLASSNAME.titleText)} />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-overline font-bold uppercase text-muted-foreground">
            {formatEpisodeNumber(episode.episodeNumber, { padded: true })}
          </span>
          {watched ? <span className="text-overline font-semibold text-primary">{t("media.seen")}</span> : null}
          {isUnreleased ? (
            <Badge variant="outline" className="text-overline text-muted-foreground">
              {t("media.notYetAired")}
            </Badge>
          ) : !watched && isLastUnwatched ? (
            <Badge variant="outline" className="text-overline text-accent">
              {t("media.lastUnwatchedEpisode")}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-body-sm font-semibold">
          {hidden ? t("media.hiddenTitle") : episode.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
          <Calendar className="size-3" />
          <span>{formatDate(episode.airDate)}</span>
          {episode.runtime ? (
            <>
              <span>•</span>
              <Clock4 className="size-3" />
              <span>{formatRuntime(episode.runtime)}</span>
            </>
          ) : null}
          {episode.rating && !hidden ? (
            <>
              <span>•</span>
              <span
                aria-label={t("media.ratingLabel", { rating: formatRating(episode.rating) })}
                className="inline-flex items-center gap-1 text-rating"
              >
                <RatingStar rating={episode.rating} starClassName="" />
              </span>
            </>
          ) : null}
        </div>
      </div>
    </>
  );

  const row = (
    <motion.div
      drag={swipeEnabled ? "x" : false}
      style={swipeEnabled ? { x: dragX } : undefined}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={swipeEnabled ? handleSwipeEnd : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-2xl p-3 transition",
        swipeEnabled ? "bg-card" : watched ? "bg-primary/[0.06]" : "hover:bg-foreground/[0.04]"
      )}
    >
      {seriesId !== undefined && seasonNumber !== undefined ? (
        <Link
          to="/series/$seriesId/season/$seasonNumber/episode/$episodeNumber"
          params={{
            seriesId: String(seriesId),
            seasonNumber: String(seasonNumber),
            episodeNumber: String(episode.episodeNumber),
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {detailsBlock}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{detailsBlock}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {!watched && !isUnreleased ? (
          <IconTooltip label={t("media.addWatchNoteAction")}>
            <button
              type="button"
              aria-label={t("media.addWatchNoteAction")}
              disabled={disabled}
              onClick={() => setNoteDialogOpen(true)}
              className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            >
              <NotebookPen className="size-4" />
            </button>
          </IconTooltip>
        ) : null}
        <SeenToggleButton
          seen={watched}
          isSaving={false}
          disabled={disabled || isUnreleased}
          disabledLabel={isUnreleased ? t("media.notYetAired") : undefined}
          onToggle={() => onToggleSeen()}
          size="lg"
        />
      </div>
      <AddWatchNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        onConfirm={(note) => {
          setNoteDialogOpen(false);
          onToggleSeen(note || undefined);
        }}
      />
    </motion.div>
  );

  if (!swipeEnabled) return row;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Revealed behind `row` as it's dragged away — opacity ramps with
          drag distance rather than snapping in, so the gesture reads as
          continuous instead of a hard toggle at the threshold. */}
      <motion.div
        aria-hidden="true"
        style={{ opacity: revealOpacity }}
        className={cn(
          "absolute inset-0 flex items-center justify-center gap-2 rounded-2xl text-body-sm font-semibold",
          watched ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground"
        )}
      >
        {watched ? <X className="size-5" /> : <Check className="size-5" />}
        {watched ? t("media.markUnseen") : t("media.markSeen")}
      </motion.div>
      {row}
    </div>
  );
}
