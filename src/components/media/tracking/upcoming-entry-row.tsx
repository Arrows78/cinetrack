import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Film, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SeenToggleButton } from "@/components/media/tracking/seen-toggle-button";
import { useSeasonDetails } from "@/features/media/use-media";
import { useEpisodeProgress } from "@/features/progress/use-progress";
import { formatEpisodeCode, formatRelativeCountdown } from "@/shared/utils/format";
import type { SeriesInput } from "@/features/progress/progress-repository";
import type { TrackingEntry } from "@/types/media";

/**
 * Episode-only: resolves the real Episode (needed for its TMDB id, which
 * TrackingEntry doesn't carry) and shows a NEW/AIRED badge plus an inline
 * quick-check, mirroring the season page's own SeenToggle. Renders nothing
 * extra while the season is still loading — the row's own countdown/date
 * badge (in UpcomingEntryRow) already covers that gap visually.
 */
function EpisodeStatus({ entry }: { entry: TrackingEntry }) {
  const { t } = useTranslation();
  const seasonQuery = useSeasonDetails(entry.mediaId, entry.seasonNumber ?? 1);
  const progressQuery = useEpisodeProgress(entry.mediaId);
  const episode = seasonQuery.data?.episodes.find((item) => item.episodeNumber === entry.episodeNumber);
  if (!episode) return null;

  const watched = (progressQuery.data ?? []).some((item) => item.episodeId === episode.id);
  // Minimal SeriesInput — id/mediaType/title are all the Rust command's
  // episode-progress write actually needs (see progress-commands.ts);
  // TrackingEntry never carries a full MediaSummary.
  const series: SeriesInput = { id: entry.mediaId, mediaType: "series", title: entry.title, overview: "", genres: [], cast: [] };

  return (
    <>
      <Badge variant={watched ? "outline" : "success"}>
        {watched ? t("upcoming.badgeAired") : t("upcoming.badgeNew")}
      </Badge>
      <SeenToggleButton
        size="sm"
        seen={watched}
        isSaving={progressQuery.isSaving}
        onToggle={() => progressQuery.toggleEpisodeSeen({ series, episode, watched: !watched })}
      />
    </>
  );
}

export function UpcomingEntryRow({ entry }: { entry: TrackingEntry }) {
  const { t } = useTranslation();
  const hasAired = Boolean(entry.date) && new Date(entry.date as string) <= new Date();

  return (
    <div className="surface flex items-center gap-3 overflow-hidden rounded-card p-3 pr-4">
      {entry.type === "episode" ? (
        <Link
          to="/series/$seriesId/season/$seasonNumber"
          params={{ seriesId: String(entry.mediaId), seasonNumber: String(entry.seasonNumber ?? 1) }}
          className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Tv className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium">{entry.title}</p>
            <p className="truncate text-caption text-muted-foreground">
              {formatEpisodeCode(entry.seasonNumber ?? 0, entry.episodeNumber ?? 0)} ·{" "}
              {entry.episodeTitle ?? t("tracking.newEpisodeFallback")}
            </p>
          </div>
          {!hasAired && entry.date ? <Badge variant="secondary">{formatRelativeCountdown(entry.date)}</Badge> : null}
        </Link>
      ) : (
        <Link
          to={entry.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
          params={
            entry.mediaType === "movie" ? { movieId: String(entry.mediaId) } : { seriesId: String(entry.mediaId) }
          }
          className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Film className="size-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate text-body-sm font-medium">{entry.title}</p>
          {!hasAired && entry.date ? (
            <Badge variant="secondary">{formatRelativeCountdown(entry.date)}</Badge>
          ) : (
            <Badge variant="outline">{t("upcoming.badgeAired")}</Badge>
          )}
        </Link>
      )}
      {hasAired && entry.type === "episode" ? <EpisodeStatus entry={entry} /> : null}
    </div>
  );
}
