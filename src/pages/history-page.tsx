import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { History, Clapperboard, Eye, EyeOff, Play, BookmarkPlus, BookmarkMinus } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { ProgressBar } from "@/components/media/progress-bar";
import { SectionHeader } from "@/components/media/section-header";
import { formatRelativeDate, percent } from "@/shared/utils/format";
import { useHistory } from "@/features/history/use-history";
import { useTrackedSeries } from "@/features/progress/use-progress";
import { cn } from "@/shared/lib/cn";
import type { LucideIcon } from "lucide-react";

type HistoryAction =
  | "movie:watched"
  | "movie:unwatched"
  | "episode:watched"
  | "episode:unwatched"
  | "watchlist:add"
  | "watchlist:remove";

const labelByAction: Record<HistoryAction, string> = {
  "movie:watched": "movieWatched",
  "movie:unwatched": "movieUnwatched",
  "episode:watched": "episodeWatched",
  "episode:unwatched": "episodeUnwatched",
  "watchlist:add": "addedToWatchlist",
  "watchlist:remove": "removedFromWatchlist",
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
};

export function HistoryPage() {
  const { t } = useTranslation();
  const historyQuery = useHistory();
  const trackedSeriesQuery = useTrackedSeries();

  return (
    <div className="grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
      {/* Activity timeline */}
      <section>
        <SectionHeader title={t("history.recentActivity")} subtitle={t("history.recentActivitySubtitle")} index={1} />

        {historyQuery.isError ? (
          <RemoteErrorState error={historyQuery.error} onRetry={() => void historyQuery.refetch()} />
        ) : historyQuery.data?.length ? (
          <div className="relative">
            {/* Vertical connector */}
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-foreground/[0.07]" />

            {historyQuery.data.map((item, i) => {
              const action = item.action as HistoryAction;
              const config = actionConfig[action] ?? actionConfig["movie:watched"];
              const Icon = config.icon;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 220, damping: 28 }}
                  className="relative flex gap-4 pb-5 last:pb-0"
                >
                  {/* Icon dot */}
                  <div
                    className={cn(
                      "relative z-raised flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border",
                      config.dot,
                      config.ring
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-snug">{item.title}</p>
                        {item.episodeTitle ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            S{item.seasonNumber}E{item.episodeNumber} • {item.episodeTitle}
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
            })}
          </div>
        ) : (
          <EmptyState icon={History} title={t("history.noActivity")} description={t("history.noActivityDesc")} />
        )}
      </section>

      {/* Tracked series */}
      <section>
        <SectionHeader
          title={t("history.seriesInProgress")}
          subtitle={t("history.seriesInProgressSubtitle")}
          index={2}
        />

        {trackedSeriesQuery.isError ? (
          <RemoteErrorState error={trackedSeriesQuery.error} onRetry={() => void trackedSeriesQuery.refetch()} />
        ) : (trackedSeriesQuery.data ?? []).length ? (
          <div className="space-y-3">
            {trackedSeriesQuery.data?.map((item, i) => {
              const progress = percent(item.watchedEpisodes, item.totalEpisodes);
              return (
                <motion.div
                  key={item.seriesId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, type: "spring", stiffness: 220, damping: 28 }}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-foreground/[0.03] p-4 transition-colors hover:bg-foreground/[0.06]"
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
                    className="absolute inset-0 rounded-2xl"
                    aria-label={item.title}
                  />
                </motion.div>
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
