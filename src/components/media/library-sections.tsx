import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check, LoaderCircle } from "lucide-react";
import { SectionHeader } from "@/components/media/section-header";
import { WatchNextRow } from "@/components/media/watch-next-section";
import { MediaGrid, type MediaGridItem } from "@/components/media/media-grid";
import { LoadingState } from "@/components/states/loading-state";
import { useNextEpisodes } from "@/features/progress/use-watch-next";
import { useMovieSeen } from "@/features/progress/use-progress";
import { useHistory } from "@/features/history/use-history";
import { buildTmdbImageUrl, formatEpisodeCode, formatRelativeDate } from "@/shared/utils/format";
import { cn } from "@/shared/lib/cn";
import type { HistoryAction, MediaSummary, MediaType, TrackedSeriesItem, ViewingHistoryItem } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";

const WATCHED_ACTIONS = new Set<HistoryAction>([
  "movie:watched",
  "episode:watched",
  "season:watched",
  "series:watched",
]);
// A generous-but-bounded slice of "recent" — this is a glance section, not
// the full history page (which already has real pagination for that).
const RECENTLY_WATCHED_LIMIT = 10;

// A library item never toggled yet has no tracked_series row at all — build
// a stand-in so it can flow through the same next-episode resolution as an
// in-progress show (resolveNextEpisode already handles zero watched
// episodes by resolving the first one).
function toTrackedSeriesItem(item: MediaGridItem, tracked?: TrackedSeriesItem): TrackedSeriesItem {
  if (tracked) return tracked;
  return {
    id: `untracked-${item.id}`,
    seriesId: item.id,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    totalEpisodes: 0,
    watchedEpisodes: 0,
    status: null,
    createdAt: "",
    updatedAt: "",
  };
}

function EpisodeRowSection({
  title,
  subtitle,
  items,
  entries,
  isLoading,
}: {
  title: string;
  subtitle: string;
  items: MediaGridItem[];
  entries: ReturnType<typeof useNextEpisodes>["entries"];
  isLoading: boolean;
}) {
  if (!items.length) return null;
  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} size="sub" />
      {!entries.length && isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {entries.map((entry) => (
            <WatchNextRow key={entry.series.seriesId} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

function MovieWatchNextRow({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const seenQuery = useMovieSeen(media.id);
  const [justChecked, setJustChecked] = useState(false);
  const poster = buildTmdbImageUrl(media.posterPath, "w185") ?? fallbackPoster;

  const handleCheck = async () => {
    setJustChecked(true);
    try {
      await seenQuery.toggleMovieSeen({ movie: media, watched: true });
    } finally {
      setJustChecked(false);
    }
  };

  return (
    <div className="surface flex items-center gap-4 overflow-hidden rounded-card p-3 pr-4">
      <Link
        to="/movies/$movieId"
        params={{ movieId: String(media.id) }}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={poster} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold leading-tight">{media.title}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {media.year ?? t("media.unknownYear")}
            {media.genres[0] ? ` · ${media.genres[0]}` : ""}
          </p>
        </div>
      </Link>

      <button
        type="button"
        disabled={seenQuery.isSaving}
        onClick={() => void handleCheck()}
        aria-label={t("media.markAsSeen")}
        title={t("media.markAsSeen")}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          justChecked
            ? "border-success bg-success text-success-foreground"
            : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
        )}
      >
        {seenQuery.isSaving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
      </button>
    </div>
  );
}

// Dimmed (opacity) on purpose — this row is a look-back, not a to-do: it
// links through to the fiche (where the watch can be corrected/undone) but
// isn't itself an actionable checklist item, unlike the rows below it.
function RecentlyWatchedRow({ entry, media }: { entry: ViewingHistoryItem; media?: MediaGridItem }) {
  const { t } = useTranslation();
  const isMovie = entry.mediaType === "movie";
  const poster = buildTmdbImageUrl(media?.posterPath, "w185") ?? fallbackPoster;

  return (
    <Link
      to={isMovie ? "/movies/$movieId" : "/series/$seriesId"}
      params={isMovie ? { movieId: String(entry.mediaId) } : { seriesId: String(entry.mediaId) }}
      className="surface flex items-center gap-4 overflow-hidden rounded-card p-3 pr-4 opacity-60 transition-opacity duration-base hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img src={poster} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded-lg object-cover" />

      <div className="min-w-0 flex-1">
        {isMovie ? (
          <p className="truncate font-display text-lg font-bold leading-tight">{entry.title}</p>
        ) : (
          <>
            <span className="inline-flex max-w-full items-center rounded-full border border-border px-2.5 py-0.5 text-overline font-semibold uppercase text-muted-foreground">
              <span className="truncate">{entry.title}</span>
            </span>
            <p className="mt-1.5 truncate font-display text-lg font-bold leading-tight">
              {entry.episodeNumber !== undefined
                ? formatEpisodeCode(entry.seasonNumber ?? 0, entry.episodeNumber, { padded: true })
                : t(`history.actions.${entry.action === "season:watched" ? "seasonWatched" : "seriesWatched"}`)}
            </p>
            {entry.episodeTitle ? <p className="truncate text-sm text-muted-foreground">{entry.episodeTitle}</p> : null}
          </>
        )}
      </div>

      <time className="shrink-0 text-caption tabular-nums text-muted-foreground">
        {formatRelativeDate(entry.timestamp)}
      </time>
    </Link>
  );
}

function RecentlyWatchedSection({
  mediaType,
  itemsById,
}: {
  mediaType: MediaType;
  itemsById: Map<number, MediaGridItem>;
}) {
  const { t } = useTranslation();
  const historyQuery = useHistory();
  const entries = (historyQuery.data?.pages.flat() ?? [])
    .filter((item) => item.mediaType === mediaType && WATCHED_ACTIONS.has(item.action) && itemsById.has(item.mediaId))
    .slice(0, RECENTLY_WATCHED_LIMIT);

  if (!entries.length) return null;

  return (
    <section>
      <SectionHeader
        title={t("library.sections.recentlyWatched")}
        subtitle={t("library.sections.recentlyWatchedDesc")}
        size="sub"
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => (
          <RecentlyWatchedRow key={entry.id} entry={entry} media={itemsById.get(entry.mediaId)} />
        ))}
      </div>
    </section>
  );
}

// The /series "My list" tab: instead of one flat sorted grid/list, split
// into what a viewer actually thinks in — a dimmed look-back at what was
// just watched, then still watching, then never started (the full list, not
// a capped preview: see item.progress === undefined/0 below) — with the
// first two getting an episode-level row (poster, next S/E, episode title,
// one-tap check) in list view, closer to the home page's Watch Next than a
// generic media card. Already-finished shows are deliberately left out —
// they're still visible on the general /library page, no need to repeat them.
export function SeriesLibrarySections({
  items,
  trackedSeries,
  viewMode,
}: {
  items: MediaGridItem[];
  trackedSeries: TrackedSeriesItem[];
  viewMode: "grid" | "list";
}) {
  const { t } = useTranslation();
  const trackedById = new Map(trackedSeries.map((series) => [series.seriesId, series]));
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const inProgress: MediaGridItem[] = [];
  const haventStarted: MediaGridItem[] = [];
  for (const item of items) {
    const progress = item.progress;
    if (progress && progress.watched > 0 && progress.watched < progress.total) inProgress.push(item);
    else if (!progress || progress.watched === 0) haventStarted.push(item);
  }

  const watchNext = useNextEpisodes(inProgress.map((item) => toTrackedSeriesItem(item, trackedById.get(item.id))));
  const notStarted = useNextEpisodes(haventStarted.map((item) => toTrackedSeriesItem(item, trackedById.get(item.id))));

  return (
    <div className="space-y-8">
      {viewMode === "list" ? (
        <>
          <RecentlyWatchedSection mediaType="series" itemsById={itemsById} />
          <EpisodeRowSection
            title={t("library.sections.watchNext")}
            subtitle={t("library.sections.watchNextDescSeries")}
            items={inProgress}
            entries={watchNext.entries}
            isLoading={watchNext.isLoading}
          />
          <EpisodeRowSection
            title={t("library.sections.haventStarted")}
            subtitle={t("library.sections.haventStartedDesc")}
            items={haventStarted}
            entries={notStarted.entries}
            isLoading={notStarted.isLoading}
          />
        </>
      ) : (
        <>
          {inProgress.length ? (
            <section>
              <SectionHeader
                title={t("library.sections.watchNext")}
                subtitle={t("library.sections.watchNextDescSeries")}
                size="sub"
              />
              <MediaGrid items={inProgress} />
            </section>
          ) : null}
          {haventStarted.length ? (
            <section>
              <SectionHeader
                title={t("library.sections.haventStarted")}
                subtitle={t("library.sections.haventStartedDesc")}
                size="sub"
              />
              <MediaGrid items={haventStarted} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

// The /movies "My list" tab: a movie has no partial-progress state, so
// there's no "watch next" bucket — just a dimmed look-back at what was
// just watched, then the full list of what hasn't been watched yet (an
// actionable row: poster, title, genre, one-tap check). Already-watched
// movies are deliberately left out — still visible on /library.
export function MovieLibrarySections({ items, viewMode }: { items: MediaGridItem[]; viewMode: "grid" | "list" }) {
  const { t } = useTranslation();
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const notWatched = items.filter((item) => !item.alreadySeen);

  return (
    <div className="space-y-8">
      {viewMode === "list" ? <RecentlyWatchedSection mediaType="movie" itemsById={itemsById} /> : null}
      {notWatched.length ? (
        <section>
          <SectionHeader
            title={t("library.sections.haventStarted")}
            subtitle={t("library.sections.haventStartedDesc")}
            size="sub"
          />
          {viewMode === "list" ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {notWatched.map((media) => (
                <MovieWatchNextRow key={media.id} media={media} />
              ))}
            </div>
          ) : (
            <MediaGrid items={notWatched} />
          )}
        </section>
      ) : null}
    </div>
  );
}
