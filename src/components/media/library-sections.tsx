import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check, LoaderCircle } from "lucide-react";
import { SectionHeader } from "@/components/media/section-header";
import { WatchNextRow } from "@/components/media/watch-next-section";
import { MediaGrid, type MediaGridItem } from "@/components/media/media-grid";
import { MediaList } from "@/components/media/media-list";
import { LoadingState } from "@/components/states/loading-state";
import { useNextEpisodes } from "@/features/progress/use-watch-next";
import { useMovieSeen } from "@/features/progress/use-progress";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { cn } from "@/shared/lib/cn";
import type { MediaSummary, TrackedSeriesItem } from "@/types/media";
import fallbackPoster from "@/assets/poster-placeholder.svg";

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

// The /series "My list" tab: instead of one flat sorted grid/list, split
// into the three buckets a viewer actually thinks in — still watching,
// never started, all caught up — with the first two getting an episode-level
// row (poster, next S/E, episode title, one-tap check) in list view, closer
// to the home page's Watch Next than a generic media card.
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

  const inProgress: MediaGridItem[] = [];
  const haventStarted: MediaGridItem[] = [];
  const finished: MediaGridItem[] = [];
  for (const item of items) {
    const progress = item.progress;
    if (progress && progress.total > 0 && progress.watched >= progress.total) finished.push(item);
    else if (progress && progress.watched > 0) inProgress.push(item);
    else haventStarted.push(item);
  }

  const watchNext = useNextEpisodes(inProgress.map((item) => toTrackedSeriesItem(item, trackedById.get(item.id))));
  const notStarted = useNextEpisodes(haventStarted.map((item) => toTrackedSeriesItem(item, trackedById.get(item.id))));

  return (
    <div className="space-y-8">
      {viewMode === "list" ? (
        <>
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
      {finished.length ? (
        <section>
          <SectionHeader
            title={t("library.sections.finished")}
            subtitle={t("library.sections.finishedDescSeries")}
            size="sub"
          />
          {viewMode === "grid" ? <MediaGrid items={finished} /> : <MediaList items={finished} />}
        </section>
      ) : null}
    </div>
  );
}

// The /movies "My list" tab: a movie has no partial-progress state, so the
// split is just "not watched yet" (an actionable row — poster, title, genre,
// one-tap check) vs "already watched" (the existing finished-bar row/card).
export function MovieLibrarySections({ items, viewMode }: { items: MediaGridItem[]; viewMode: "grid" | "list" }) {
  const { t } = useTranslation();
  const notWatched = items.filter((item) => !item.alreadySeen);
  const watched = items.filter((item) => item.alreadySeen);

  return (
    <div className="space-y-8">
      {notWatched.length ? (
        <section>
          <SectionHeader
            title={t("library.sections.watchNext")}
            subtitle={t("library.sections.watchNextDescMovies")}
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
      {watched.length ? (
        <section>
          <SectionHeader
            title={t("library.sections.finished")}
            subtitle={t("library.sections.finishedDescMovies")}
            size="sub"
          />
          {viewMode === "grid" ? <MediaGrid items={watched} /> : <MediaList items={watched} />}
        </section>
      ) : null}
    </div>
  );
}
