import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Calendar, Clock4 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl, formatDate, formatRuntime, formatRating } from "@/shared/utils/format";
import { useConfetti } from "@/hooks/use-confetti";
import type { Episode } from "@/types/media";

function EpisodeCheckButton({
  watched,
  disabled,
  onToggle,
  isLastUnwatched,
}: {
  watched: boolean;
  disabled?: boolean;
  onToggle: () => void;
  isLastUnwatched?: boolean;
}) {
  const { celebrate, burstFromRef } = useConfetti();
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (disabled) return;
    if (!watched) {
      burstFromRef(ref.current);
      if (isLastUnwatched) setTimeout(celebrate, 200);
    }
    onToggle();
  };

  return (
    <motion.button
      ref={ref}
      onClick={handleClick}
      disabled={disabled}
      whileTap={{ scale: 0.85 }}
      className={cn(
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
        watched
          ? "border-primary bg-primary text-primary-foreground shadow-glow"
          : "border-black/20 dark:border-white/20 bg-transparent text-transparent hover:border-primary/50"
      )}
    >
      <AnimatePresence>
        {watched && (
          <motion.div
            key="check"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
            transition={{ type: "spring", stiffness: 450, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function EpisodeCard({
  episode,
  onToggleSeen,
  disabled,
  isLastUnwatched,
}: {
  episode: Episode;
  onToggleSeen: () => void;
  disabled?: boolean;
  isLastUnwatched?: boolean;
}) {
  const { t } = useTranslation();
  const watched = Boolean(episode.watched);

  return (
    <motion.div
      layout
      className={cn(
        "group flex items-center gap-3 rounded-2xl p-3 transition-all duration-200",
        watched ? "bg-primary/[0.06]" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video h-[62px] w-[110px] shrink-0 overflow-hidden rounded-xl">
        <img
          src={buildTmdbImageUrl(episode.stillPath, "w342") ?? "https://placehold.co/320x180/111827/374151?text=."}
          alt={episode.title}
          className={cn(
            "h-full w-full object-cover transition-all duration-300",
            watched ? "brightness-75" : "group-hover:scale-[1.05]"
          )}
        />
        {watched && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/25">
            <Check className="h-4 w-4 text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            E{episode.episodeNumber.toString().padStart(2, "0")}
          </span>
          {watched && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[10px] font-semibold text-primary"
            >
              {t("media.seen")}
            </motion.span>
          )}
        </div>
        <p
          className={cn(
            "mt-0.5 line-clamp-1 text-sm font-semibold leading-snug transition-colors",
            watched && "text-muted-foreground"
          )}
        >
          {episode.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{formatDate(episode.airDate)}</span>
          {episode.runtime ? (
            <>
              <span>•</span>
              <Clock4 className="h-3 w-3" />
              <span>{formatRuntime(episode.runtime)}</span>
            </>
          ) : null}
          {episode.rating ? (
            <>
              <span>•</span>
              <span className="text-amber-400/80">★ {formatRating(episode.rating)}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Check button */}
      <EpisodeCheckButton
        watched={watched}
        disabled={disabled}
        onToggle={onToggleSeen}
        isLastUnwatched={isLastUnwatched}
      />
    </motion.div>
  );
}
