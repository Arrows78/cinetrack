import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/media/primitives/progress-bar";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { useMovieSeen } from "@/features/progress/use-progress";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl, formatRating } from "@/shared/utils/format";
import { progressBarTone } from "@/shared/utils/series-status";
import type { MediaSummary } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";
import type { MediaCardProgress } from "./media-card";

// Movies only, same reasoning as MediaCard's SeenQuickAction: toggling a
// series "seen" means writing every episode across every season, too heavy
// for an inline row action — series rows link through to the season/episode
// list instead (the chevron below).
function SeenToggle({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const seenQuery = useMovieSeen(media.id);
  const label = seenQuery.data ? t("media.markUnseen") : t("media.markSeen");

  return (
    <IconTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={Boolean(seenQuery.data)}
        disabled={seenQuery.isSaving}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void seenQuery.toggleMovieSeen({ movie: media, watched: !seenQuery.data });
        }}
        className={cn(
          "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors",
          "hover:border-primary hover:text-primary disabled:pointer-events-none disabled:cursor-default disabled:opacity-50",
          seenQuery.data && "border-success bg-success/15 text-success hover:border-success hover:text-success"
        )}
      >
        <Check className="size-4" />
      </button>
    </IconTooltip>
  );
}

export function MediaListRow({
  media,
  progress,
  alreadySeen,
}: {
  media: MediaSummary;
  progress?: MediaCardProgress;
  alreadySeen?: boolean;
}) {
  const { t } = useTranslation();
  const image = buildTmdbImageUrl(media.posterPath, "w92") ?? fallbackPoster;
  const showProgress = progress !== undefined && progress.total > 0;
  const percent = showProgress ? Math.min(100, Math.round((progress.watched / progress.total) * 100)) : 0;
  const tone = showProgress ? progressBarTone(progress.watched, progress.total, progress.seriesStatus) : null;
  const showFinishedBar = !showProgress && alreadySeen;

  return (
    <Tile className="mb-2 flex items-center gap-3 p-2.5 transition-colors hover:bg-foreground/[0.03] sm:p-3">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3"
        to={media.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
        params={media.mediaType === "movie" ? { movieId: String(media.id) } : { seriesId: String(media.id) }}
      >
        <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg sm:w-14">
          <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{media.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
            <Badge
              variant={media.mediaType === "movie" ? "movie" : "series"}
              className="px-2 py-0 text-overline font-semibold uppercase"
            >
              {media.mediaType === "movie" ? t("media.movie") : t("media.series")}
            </Badge>
            <span>{media.year ?? t("media.unknownYear")}</span>
            {media.genres[0] ? <span className="truncate">· {media.genres[0]}</span> : null}
            <span className="ml-auto flex items-center gap-1 tabular-nums">
              <span className="text-rating" aria-hidden="true">
                ★
              </span>
              {formatRating(media.rating)}
            </span>
          </div>
          {showProgress ? (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar
                value={percent}
                size="sm"
                className="flex-1"
                ariaLabel={t("media.episodes")}
                tone={tone ?? undefined}
              />
              <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                {progress.watched}/{progress.total}
              </span>
            </div>
          ) : showFinishedBar ? (
            <div className="mt-2">
              <ProgressBar value={100} size="sm" ariaLabel={t("media.alreadySeen")} tone="finished" />
            </div>
          ) : null}
        </div>
      </Link>
      {media.mediaType === "movie" ? (
        <SeenToggle media={media} />
      ) : (
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </Tile>
  );
}
