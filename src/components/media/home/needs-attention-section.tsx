import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tile } from "@/components/ui/tile";
import { SectionHeader } from "@/components/media/primitives/section-header";
import type { StaleLibraryItem } from "@/features/library/use-library-health-selectors";
import type { TrackedSeriesItem } from "@/types/media";

// A tracked series counts as "needs attention" once this many aired
// episodes are waiting — fewer than this is just ordinary progress (already
// covered by "Continuer à regarder"), not a pile-up worth flagging.
export const BACKLOG_THRESHOLD = 3;

export interface BacklogSeries {
  series: TrackedSeriesItem;
  remaining: number;
}

/** Exported for isolated unit testing — series with a real pile-up of aired-but-unwatched episodes. */
export function selectBacklogSeries(trackedSeries: TrackedSeriesItem[]): BacklogSeries[] {
  return trackedSeries
    .map((series) => ({ series, remaining: series.totalEpisodes - series.watchedEpisodes }))
    .filter(({ remaining }) => remaining >= BACKLOG_THRESHOLD);
}

/** Today Hub's "Éléments nécessitant une action" card — episode backlogs and forgotten planned items. */
export function NeedsAttentionSection({ backlog, stale }: { backlog: BacklogSeries[]; stale: StaleLibraryItem[] }) {
  const { t } = useTranslation();
  if (!backlog.length && !stale.length) return null;

  return (
    <div>
      <SectionHeader title={t("home.needsAttentionTitle")} subtitle={t("home.needsAttentionSubtitle")} size="sub" />
      <div className="grid gap-2 lg:grid-cols-2">
        {backlog.map(({ series, remaining }) => (
          <Tile
            asChild
            key={`backlog-${series.seriesId}`}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]"
          >
            <Link to="/series/$seriesId" params={{ seriesId: String(series.seriesId) }}>
              <ListTodo className="size-4 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{series.title}</p>
              <Badge variant="secondary">{t("home.needsAttentionBacklogBadge", { count: remaining })}</Badge>
            </Link>
          </Tile>
        ))}
        {stale.map(({ item, daysSinceUpdate }) => (
          <Tile
            asChild
            key={`stale-${item.mediaType}-${item.mediaId}`}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]"
          >
            <Link
              to={item.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
              params={
                item.mediaType === "movie" ? { movieId: String(item.mediaId) } : { seriesId: String(item.mediaId) }
              }
            >
              <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</p>
              <Badge variant="outline">{t("home.needsAttentionStaleBadge", { days: daysSinceUpdate })}</Badge>
            </Link>
          </Tile>
        ))}
      </div>
    </div>
  );
}
