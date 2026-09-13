import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Bell, Film, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tile } from "@/components/ui/tile";
import { SeenToggleButton } from "@/components/media/tracking/seen-toggle-button";
import { useSeasonDetails } from "@/features/media/use-media";
import { useEpisodeProgress } from "@/features/progress/use-progress";
import { formatEpisodeCode, formatRelativeCountdown } from "@/shared/utils/format";
import type { SeriesInput } from "@/features/progress/progress-repository";
import type { TrackingEntry } from "@/types/media";

const rowClassName = "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]";

function hasEntryAired(entry: TrackingEntry): boolean {
  return Boolean(entry.date) && new Date(entry.date as string) <= new Date();
}

/**
 * Episode-only, opted into by showAiredStatus once an entry's date has
 * passed: resolves the real Episode (needed for its TMDB id, which
 * TrackingEntry doesn't carry) and shows a New/Aired badge plus an inline
 * quick-check, mirroring the season page's own SeenToggle. Renders nothing
 * while the season is still loading — the row's own date grouping already
 * covers that gap visually.
 */
function EpisodeAiredStatus({ entry }: { entry: TrackingEntry }) {
  const { t } = useTranslation();
  const seasonQuery = useSeasonDetails(entry.mediaId, entry.seasonNumber ?? 1);
  const progressQuery = useEpisodeProgress(entry.mediaId);
  const episode = seasonQuery.data?.episodes.find((item) => item.episodeNumber === entry.episodeNumber);
  if (!episode) return null;

  const watched = (progressQuery.data ?? []).some((item) => item.episodeId === episode.id);
  // Minimal SeriesInput — id/mediaType/title are all the Rust command's
  // episode-progress write actually needs (see progress-commands.ts);
  // TrackingEntry never carries a full MediaSummary.
  const series: SeriesInput = {
    id: entry.mediaId,
    mediaType: "series",
    title: entry.title,
    overview: "",
    genres: [],
    cast: [],
  };

  return (
    <>
      <Badge variant={watched ? "outline" : "success"}>
        {watched ? t("tracking.badgeAired") : t("tracking.badgeNew")}
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

function DatedRowBody({
  entry,
  showScopeBadge,
  showCountdown,
  showAiredStatus,
}: {
  entry: TrackingEntry;
  showScopeBadge: boolean;
  showCountdown: boolean;
  showAiredStatus: boolean;
}) {
  const { t } = useTranslation();
  const aired = showAiredStatus && hasEntryAired(entry);
  return (
    <>
      {entry.type === "episode" ? (
        <Tv className="size-4 shrink-0 text-primary" />
      ) : (
        <Film className="size-4 shrink-0 text-primary" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-body-sm font-medium">{entry.title}</p>
          {showScopeBadge ? (
            entry.scope === "mine" ? (
              <Badge variant="default">{t("tracking.scopeMine")}</Badge>
            ) : (
              <Badge variant="outline">{t("tracking.discoveryBadge")}</Badge>
            )
          ) : null}
        </div>
        <p className="truncate text-caption text-muted-foreground">
          {entry.type === "episode"
            ? `${formatEpisodeCode(entry.seasonNumber ?? 0, entry.episodeNumber ?? 0)} · ${
                entry.episodeTitle ?? t("tracking.newEpisodeFallback")
              }`
            : t("tracking.theatricalRelease")}
        </p>
      </div>
      {aired && entry.type !== "episode" ? <Badge variant="outline">{t("tracking.badgeAired")}</Badge> : null}
      {!aired && showCountdown && entry.date ? (
        <Badge variant="secondary">{formatRelativeCountdown(entry.date)}</Badge>
      ) : null}
      {aired && entry.type === "episode" ? <EpisodeAiredStatus entry={entry} /> : null}
    </>
  );
}

function AvailabilityRowBody({ entry }: { entry: TrackingEntry }) {
  const { t } = useTranslation();
  return (
    <>
      <Bell className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate text-body-sm font-medium">{entry.title}</p>
      <Badge variant="success">{t("tracking.availableNow")}</Badge>
    </>
  );
}

/**
 * Shared release/episode/availability row, used by TrackingList (the full
 * /tracking page and the /movies·/series "Upcoming" tab), WeeklyAgendaSection
 * and AvailableNowSection (the Today Hub's dashboard rails). Was three
 * near-identical components before this — same icon+title+subtitle markup,
 * copy-pasted with small drifts (padding, whether the episode title showed
 * up alongside its code). A standalone /upcoming page and UpcomingEntryRow
 * used to duplicate this same data for a countdown/New/Aired glance view —
 * that capability now lives here instead, behind showAiredStatus, so
 * TrackingList (and by extension the /movies·/series "Upcoming" tab) gets it
 * for free rather than maintaining a second, near-identical page.
 *
 * Each branch below keeps its own Link a matched `to`/`params`/`search`
 * literal (rather than one Link with a conditional `to`) — same convention
 * FilmographyCard (person-detail-page.tsx) and MediaCard use for their own
 * movie/series routing, since TanStack Router can't type-check a computed
 * `to` against the right params/search shape.
 */
export function TrackingEntryRow({
  entry,
  showScopeBadge = false,
  showCountdown = false,
  showAiredStatus = false,
  dashboardRail = false,
}: {
  entry: TrackingEntry;
  /** TrackingList's own "mine" vs "discovery" filter — the dashboard rails never mix scopes, so they never need this. */
  showScopeBadge?: boolean;
  /** WeeklyAgendaSection's flat (not grouped-by-date) list needs the countdown inline; TrackingList already groups its dated entries under a date heading, so it'd be redundant there. */
  showCountdown?: boolean;
  /**
   * TrackingList only: once an entry's date is in the past, swap its
   * countdown for an Aired badge, and for episodes specifically add an
   * inline New/Aired badge plus a quick seen-toggle. Off by default for the
   * dashboard rails (Today Hub, weekly agenda), which stay glanceable rather
   * than actionable.
   */
  showAiredStatus?: boolean;
  // Dashboard rails (Today Hub, weekly agenda) and availability alerts open
  // the full series page with the season pre-expanded (a search param) so
  // there's a way back to the rest of the show — see seriesDetailRoute's
  // own `season` search param comment in router-config.tsx. The standalone
  // /tracking page (and the /movies·/series "Upcoming" tab) instead opens
  // the isolated season page directly, since the user is already
  // deliberately browsing a full list there.
  dashboardRail?: boolean;
}): ReactNode {
  if (entry.type === "availability") {
    return (
      <Tile asChild className={rowClassName}>
        <Link
          to={entry.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
          params={
            entry.mediaType === "movie" ? { movieId: String(entry.mediaId) } : { seriesId: String(entry.mediaId) }
          }
        >
          <AvailabilityRowBody entry={entry} />
        </Link>
      </Tile>
    );
  }

  if (entry.type === "episode" && dashboardRail) {
    return (
      <Tile asChild className={rowClassName}>
        <Link
          to="/series/$seriesId"
          params={{ seriesId: String(entry.mediaId) }}
          search={{ season: entry.seasonNumber ?? 1 }}
        >
          <DatedRowBody
            entry={entry}
            showScopeBadge={showScopeBadge}
            showCountdown={showCountdown}
            showAiredStatus={showAiredStatus}
          />
        </Link>
      </Tile>
    );
  }

  if (entry.type === "episode") {
    return (
      <Tile asChild className={rowClassName}>
        <Link
          to="/series/$seriesId/season/$seasonNumber"
          params={{ seriesId: String(entry.mediaId), seasonNumber: String(entry.seasonNumber ?? 1) }}
        >
          <DatedRowBody
            entry={entry}
            showScopeBadge={showScopeBadge}
            showCountdown={showCountdown}
            showAiredStatus={showAiredStatus}
          />
        </Link>
      </Tile>
    );
  }

  return (
    <Tile asChild className={rowClassName}>
      <Link to="/movies/$movieId" params={{ movieId: String(entry.mediaId) }}>
        <DatedRowBody
          entry={entry}
          showScopeBadge={showScopeBadge}
          showCountdown={showCountdown}
          showAiredStatus={showAiredStatus}
        />
      </Link>
    </Tile>
  );
}
