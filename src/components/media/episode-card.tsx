import { Calendar, Check, Clock4, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl, formatDate, formatEpisodeNumber, formatRating, formatRuntime } from "@/shared/utils/format";
import type { Episode } from "@/types/media";
export function EpisodeCard({
  episode,
  onToggleSeen,
  disabled,
}: {
  episode: Episode;
  onToggleSeen: () => void;
  disabled?: boolean;
  isLastUnwatched?: boolean;
}) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const watched = Boolean(episode.watched);
  const hidden = Boolean(preferences.data?.spoilerProtection && !watched);
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl p-3 transition",
        watched ? "bg-primary/[0.06]" : "hover:bg-foreground/[0.04]"
      )}
    >
      <div className="relative aspect-video h-[62px] w-[110px] shrink-0 overflow-hidden rounded-xl bg-muted">
        {hidden ? (
          <div className="flex h-full items-center justify-center">
            <EyeOff className="size-5 text-muted-foreground" />
          </div>
        ) : (
          <img
            src={buildTmdbImageUrl(episode.stillPath, "w342") ?? "https://placehold.co/320x180/111827/374151?text=."}
            alt={episode.title}
            className="h-full w-full object-cover"
          />
        )}
        {watched ? (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/25">
            <Check className="size-4 text-white" />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-overline font-bold uppercase text-muted-foreground">
            {formatEpisodeNumber(episode.episodeNumber, { padded: true })}
          </span>
          {watched ? <span className="text-overline font-semibold text-primary">{t("media.seen")}</span> : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm font-semibold">{hidden ? t("media.hiddenTitle") : episode.title}</p>
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
              <span className="text-rating/80">★ {formatRating(episode.rating)}</span>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label={watched ? t("media.markUnseen") : t("media.markSeen")}
        disabled={disabled}
        onClick={onToggleSeen}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full border-2",
          watched ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
        )}
      >
        {watched ? <Check className="size-5" /> : null}
      </button>
    </div>
  );
}
