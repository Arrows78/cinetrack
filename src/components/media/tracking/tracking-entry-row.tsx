import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Bell, Film, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tile } from "@/components/ui/tile";
import { formatEpisodeCode, formatRelativeCountdown } from "@/shared/utils/format";
import type { TrackingEntry } from "@/types/media";

const rowClassName = "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]";

function DatedRowBody({
  entry,
  showScopeBadge,
  showCountdown,
}: {
  entry: TrackingEntry;
  showScopeBadge: boolean;
  showCountdown: boolean;
}) {
  const { t } = useTranslation();
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
      {showCountdown && entry.date ? <Badge variant="secondary">{formatRelativeCountdown(entry.date)}</Badge> : null}
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
 * up alongside its code).
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
  dashboardRail = false,
}: {
  entry: TrackingEntry;
  /** TrackingList's own "mine" vs "discovery" filter — the dashboard rails never mix scopes, so they never need this. */
  showScopeBadge?: boolean;
  /** WeeklyAgendaSection's flat (not grouped-by-date) list needs the countdown inline; TrackingList already groups its dated entries under a date heading, so it'd be redundant there. */
  showCountdown?: boolean;
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
          <DatedRowBody entry={entry} showScopeBadge={showScopeBadge} showCountdown={showCountdown} />
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
          <DatedRowBody entry={entry} showScopeBadge={showScopeBadge} showCountdown={showCountdown} />
        </Link>
      </Tile>
    );
  }

  return (
    <Tile asChild className={rowClassName}>
      <Link to="/movies/$movieId" params={{ movieId: String(entry.mediaId) }}>
        <DatedRowBody entry={entry} showScopeBadge={showScopeBadge} showCountdown={showCountdown} />
      </Link>
    </Tile>
  );
}
