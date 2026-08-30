import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Virtuoso } from "react-virtuoso";
import {
  History,
  Clapperboard,
  Eye,
  EyeOff,
  Play,
  BookmarkPlus,
  BookmarkMinus,
  Layers,
  Tv,
  LibraryBig,
  ListPlus,
  ListMinus,
} from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { Tile } from "@/components/ui/tile";
import { FilterBar } from "@/components/media/library/filter-bar";
import { LoadMoreButton } from "@/components/media/primitives/load-more-button";
import { ProgressBar } from "@/components/media/primitives/progress-bar";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { formatEpisodeCode, formatRelativeDate, percent } from "@/shared/utils/format";
import { useHistory } from "@/features/history/use-history";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { cn } from "@/shared/lib/cn";
import type { HistoryAction } from "@/types/media";
import type { LucideIcon } from "lucide-react";

const labelByAction: Record<HistoryAction, string> = {
  "movie:watched": "movieWatched",
  "movie:unwatched": "movieUnwatched",
  "episode:watched": "episodeWatched",
  "episode:unwatched": "episodeUnwatched",
  "season:watched": "seasonWatched",
  "season:unwatched": "seasonUnwatched",
  "series:watched": "seriesWatched",
  "series:unwatched": "seriesUnwatched",
  "watchlist:add": "addedToLibrary",
  "watchlist:remove": "removedFromLibrary",
  "library:update": "libraryUpdate",
  "list:add": "listAdd",
  "list:remove": "listRemove",
};

const actionConfig: Record<HistoryAction, { icon: LucideIcon; dot: string; ring: string }> = {
  "movie:watched": {
    icon: Eye,
    dot: "bg-primary/15 text-primary",
    ring: "border-primary/20",
  },
  "movie:unwatched": {
    icon: EyeOff,
    dot: "bg-foreground/5 text-muted-foreground",
    ring: "border-border",
  },
  "episode:watched": {
    icon: Play,
    dot: "bg-accent/15 text-accent",
    ring: "border-accent/20",
  },
  "episode:unwatched": {
    icon: EyeOff,
    dot: "bg-foreground/5 text-muted-foreground",
    ring: "border-border",
  },
  "season:watched": {
    icon: Layers,
    dot: "bg-accent/15 text-accent",
    ring: "border-accent/20",
  },
  "season:unwatched": {
    icon: EyeOff,
    dot: "bg-foreground/5 text-muted-foreground",
    ring: "border-border",
  },
  "series:watched": {
    icon: Tv,
    dot: "bg-primary/15 text-primary",
    ring: "border-primary/20",
  },
  "series:unwatched": {
    icon: EyeOff,
    dot: "bg-foreground/5 text-muted-foreground",
    ring: "border-border",
  },
  "watchlist:add": {
    icon: BookmarkPlus,
    dot: "bg-success/15 text-success",
    ring: "border-success/20",
  },
  "watchlist:remove": {
    icon: BookmarkMinus,
    dot: "bg-destructive/15 text-destructive",
    ring: "border-destructive/20",
  },
  "library:update": {
    icon: LibraryBig,
    dot: "bg-primary/15 text-primary",
    ring: "border-primary/20",
  },
  "list:add": {
    icon: ListPlus,
    dot: "bg-success/15 text-success",
    ring: "border-success/20",
  },
  "list:remove": {
    icon: ListMinus,
    dot: "bg-destructive/15 text-destructive",
    ring: "border-destructive/20",
  },
};

export function HistoryPage() {
  const { t } = useTranslation();
  const historyQuery = useHistory();
  const trackedSeriesQuery = useTrackedSeries();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");

  const filteredHistory = useMemo(
    () =>
      (historyQuery.data?.pages.flat() ?? []).filter((item) =>
        typeFilter === "all" ? true : item.mediaType === typeFilter
      ),
    [historyQuery.data, typeFilter]
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
      {/* No single section title matches "History" as a page label (the
          page shows two co-equal sections, "Recent Activity" and "Series in
          Progress") — a sr-only <h1> is the page's real heading instead,
          same text as the nav label. */}
      <h1 className="sr-only">{t("nav.history")}</h1>
      {/* Activity timeline */}
      <section>
        <SectionHeader
          title={t("history.recentActivity")}
          subtitle={t("history.recentActivitySubtitle")}
          index={1}
          action={
            <FilterBar
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: t("settings.all") },
                { value: "series", label: t("nav.series") },
                { value: "movie", label: t("nav.movies") },
              ]}
            />
          }
        />

        {historyQuery.isLoading ? (
          <LoadingState />
        ) : historyQuery.isError ? (
          <RemoteErrorState error={historyQuery.error} onRetry={() => void historyQuery.refetch()} />
        ) : filteredHistory.length ? (
          <Virtuoso
            useWindowScroll
            data={filteredHistory}
            initialItemCount={Math.min(filteredHistory.length, 20)}
            // `item` can momentarily be undefined here — Virtuoso's internal
            // index bookkeeping trails one render behind when `data` shrinks
            // (e.g. switching the type filter to a shorter list), not just
            // when it grows via pagination.
            computeItemKey={(index, item) => item?.id ?? index}
            itemContent={(i, item) => {
              if (!item) return null;
              const action = item.action;
              const config = actionConfig[action];
              const Icon = config.icon;
              const isLast = i === filteredHistory.length - 1;

              return (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 20) * 0.04, type: "spring", stiffness: 220, damping: 28 }}
                  className="relative flex gap-4 pb-5"
                >
                  {/* Icon dot, with its own connector segment reaching down
                      to the next row — each mounted row draws its own
                      segment instead of one absolutely-positioned line
                      spanning the whole (now virtualized, partially
                      unmounted) list. */}
                  <div className="relative shrink-0">
                    {!isLast && <div className="absolute left-[1.1875rem] top-2 -bottom-5 w-px bg-foreground/[0.07]" />}
                    <div
                      className={cn(
                        "relative z-raised flex h-[2.375rem] w-[2.375rem] items-center justify-center rounded-full border",
                        config.dot,
                        config.ring
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-snug">{item.title}</p>
                        {item.episodeTitle ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatEpisodeCode(item.seasonNumber ?? 0, item.episodeNumber ?? 0)} • {item.episodeTitle}
                          </p>
                        ) : null}
                        <p className="mt-1 text-caption text-muted-foreground">
                          {t(`history.actions.${labelByAction[action]}`)}
                        </p>
                      </div>
                      <time className="shrink-0 text-caption text-muted-foreground pt-0.5">
                        {formatRelativeDate(item.timestamp)}
                      </time>
                    </div>
                  </div>
                </motion.div>
              );
            }}
          />
        ) : (
          <EmptyState icon={History} title={t("history.noActivity")} description={t("history.noActivityDesc")} />
        )}
        <LoadMoreButton
          hasNextPage={historyQuery.hasNextPage}
          isFetchingNextPage={historyQuery.isFetchingNextPage}
          onClick={() => void historyQuery.fetchNextPage()}
        />
      </section>

      {/* Tracked series */}
      <section>
        <SectionHeader
          title={t("history.seriesInProgress")}
          subtitle={t("history.seriesInProgressSubtitle")}
          index={2}
        />

        {trackedSeriesQuery.isLoading ? (
          <LoadingState />
        ) : trackedSeriesQuery.isError ? (
          <RemoteErrorState error={trackedSeriesQuery.error} onRetry={() => void trackedSeriesQuery.refetch()} />
        ) : (trackedSeriesQuery.data ?? []).length ? (
          <div className="space-y-3">
            {trackedSeriesQuery.data?.map((item, i) => {
              const progress = percent(item.watchedEpisodes, item.totalEpisodes);
              return (
                <Tile
                  asChild
                  key={item.seriesId}
                  className="bg-foreground/[0.03] p-4 transition-colors hover:bg-foreground/[0.06]"
                >
                  <motion.div
                    className="group relative overflow-hidden"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 220, damping: 28 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold leading-snug">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.watchedEpisodes}/{item.totalEpisodes} {t("history.episodesWatched")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-2xl font-bold text-primary leading-none">
                          {progress}
                          <span className="text-sm font-normal text-primary/60">%</span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={progress} />
                    </div>
                    {/* Full-card link */}
                    <Link
                      to="/series/$seriesId"
                      params={{ seriesId: String(item.seriesId) }}
                      className="absolute inset-0 rounded-xl"
                      aria-label={item.title}
                    />
                  </motion.div>
                </Tile>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Clapperboard}
            title={t("history.noTrackedSeries")}
            description={t("history.noTrackedSeriesDesc")}
          />
        )}
      </section>
    </div>
  );
}
