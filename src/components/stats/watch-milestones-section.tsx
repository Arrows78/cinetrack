import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Lock, Trophy } from "lucide-react";
import { useWatchMilestones } from "@/features/stats/use-stats";
import { MILESTONE_CATEGORY_ICON, MILESTONE_THRESHOLD_KEY } from "@/features/stats";
import { ShareCancelledError, downloadMilestoneCard, renderMilestoneCard } from "@/features/stats";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { Badge } from "@/components/ui/badge";
import { IconTooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { ExportPreviewDialog } from "@/components/stats/export-preview-dialog";
import { logger } from "@/shared/lib/logger";
import { displayMessage } from "@/shared/lib/user-facing-error";
import { formatDate } from "@/shared/utils/format";
import { cn } from "@/shared/lib/cn";
import type { WatchMilestone } from "@/types/media";

// A category icon (what this milestone tracks) plus a small achieved/locked
// corner badge — every threshold in a category previously rendered the same
// generic trophy/lock glyph, distinguishable only by its caption text.
function MilestoneBadge({ milestone }: { milestone: WatchMilestone }) {
  const CategoryIcon = MILESTONE_CATEGORY_ICON[milestone.category];
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-full border",
          milestone.achieved
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-foreground/5 text-muted-foreground"
        )}
      >
        <CategoryIcon className="size-5" aria-hidden="true" />
      </div>
      <div
        className={cn(
          "absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-background",
          milestone.achieved ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {milestone.achieved ? (
          <Trophy className="size-3" aria-hidden="true" />
        ) : (
          <Lock className="size-3" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/**
 * Watch milestones — threshold-crossing achievements, computed from the
 * same current-state semantics as get_stats_overview's headline totals
 * (episodes/movies/hours read the latest event per title, not a raw
 * event-log sum; completed series reads library_items' current status), so
 * unwatching something can un-achieve a milestone exactly like it reduces
 * the Stats page's own totals above.
 */
export function WatchMilestonesSection() {
  const { t } = useTranslation();
  const milestones = useWatchMilestones();
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [isSavingExport, setIsSavingExport] = useState(false);
  const [previewMilestone, setPreviewMilestone] = useState<WatchMilestone | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewMilestone(null);
  };

  useEffect(() => {
    if (milestones.isError) {
      logger.warn(
        `Watch milestones failed to load: ${
          milestones.error instanceof Error ? milestones.error.message : String(milestones.error)
        }`
      );
    }
  }, [milestones.isError, milestones.error]);

  // Failure says so and offers a retry rather than vanishing — an absent
  // panel reads as "no milestones yet", the opposite of what happened.
  if (milestones.isError) {
    return (
      <Panel>
        <h2 className="text-heading-sm">{t("stats.milestones.title")}</h2>
        <PartialErrorState
          className="mt-4"
          message={t("stats.sectionUnavailable", { section: t("stats.milestones.title") })}
          onRetry={() => void milestones.refetch()}
        />
      </Panel>
    );
  }
  if (!milestones.data) return null;

  const exportMilestone = async (milestone: WatchMilestone) => {
    setExportingId(milestone.id);
    try {
      const milestoneLabel = t(MILESTONE_THRESHOLD_KEY[milestone.category], { count: milestone.threshold });
      const blob = await renderMilestoneCard(
        {
          milestoneLabel,
          achievedDateLabel: milestone.achievedAt ? formatDate(milestone.achievedAt) : null,
        },
        {
          brand: t("sidebar.brand.name"),
          tagline: t("sidebar.brand.tagline"),
          milestoneTitle: t("stats.milestones.cardTitle"),
          achievedLabel: t("stats.milestones.achievedCardLabel"),
        }
      );
      setPreviewMilestone(milestone);
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      logger.warn(`Milestone export failed: ${error instanceof Error ? error.message : String(error)}`);
      toast({ description: displayMessage(error, t("stats.milestones.exportFailed")), variant: "error" });
    } finally {
      setExportingId(null);
    }
  };

  const confirmExportMilestone = async () => {
    if (!previewBlob || !previewMilestone) return;
    setIsSavingExport(true);
    try {
      await downloadMilestoneCard(previewBlob, previewMilestone.id);
      toast({ description: t("stats.milestones.exportSuccess"), variant: "success" });
      closePreview();
    } catch (error) {
      if (error instanceof ShareCancelledError) return;
      logger.warn(`Milestone export failed: ${error instanceof Error ? error.message : String(error)}`);
      toast({ description: displayMessage(error, t("stats.milestones.exportFailed")), variant: "error" });
    } finally {
      setIsSavingExport(false);
    }
  };

  return (
    <Panel>
      <h2 className="text-heading-sm">{t("stats.milestones.title")}</h2>
      <p className="mt-1 text-body-sm text-muted-foreground">{t("stats.milestones.description")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {milestones.data.map((milestone) => (
          <Tile
            key={milestone.id}
            className={cn("flex items-start gap-3 p-3", milestone.achieved && "border-primary/30 bg-primary/5")}
          >
            <MilestoneBadge milestone={milestone} />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium">
                {t(MILESTONE_THRESHOLD_KEY[milestone.category], { count: milestone.threshold })}
              </p>
              {milestone.achieved ? (
                <Badge variant="success" className="mt-1">
                  {milestone.achievedAt ? formatDate(milestone.achievedAt) : t("stats.milestones.achieved")}
                </Badge>
              ) : (
                <p className="mt-1 text-caption text-muted-foreground">
                  {t("stats.milestones.progress", { current: milestone.currentValue, target: milestone.threshold })}
                </p>
              )}
            </div>
            {milestone.achieved ? (
              <IconTooltip label={t("stats.milestones.export")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={t("stats.milestones.export")}
                  disabled={exportingId === milestone.id}
                  onClick={() => void exportMilestone(milestone)}
                >
                  <Download className="size-4" />
                </Button>
              </IconTooltip>
            ) : null}
          </Tile>
        ))}
      </div>

      <ExportPreviewDialog
        open={exportingId !== null || previewUrl !== null}
        onOpenChange={(open) => !open && closePreview()}
        title={t("stats.exportPreviewTitle")}
        imageUrl={previewUrl}
        isConfirming={isSavingExport}
        onConfirm={() => void confirmExportMilestone()}
      />
    </Panel>
  );
}
