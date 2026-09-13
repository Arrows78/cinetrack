import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWatchMilestones } from "@/features/stats/use-stats";
import { MILESTONE_THRESHOLD_KEY } from "@/features/stats";
import { useConfetti } from "@/hooks/use-confetti";
import { toast } from "@/components/ui/use-toast";
import { MILESTONE_CELEBRATION_WINDOW_MS } from "@/shared/constants/query";

/**
 * The Stats page's WatchMilestonesSection only surfaces a crossed threshold
 * (e.g. "100 episodes watched") to someone who happens to open Stats — cross
 * it while marking an episode seen from a detail page or the tracking list
 * and nothing acknowledges it in the moment. This watches the same
 * useWatchMilestones() query (already invalidated by every progress/library
 * mutation, so it refetches right after a mark-seen) and celebrates any
 * milestone whose `achievedAt` is fresh.
 *
 * `achievedAt` — set once, server-side, the instant a threshold is crossed —
 * is used instead of a persisted "already celebrated" flag: it's already the
 * exact signal needed ("did this just happen"), costs no extra storage, and
 * needs no per-profile reset when switching profiles. The celebratedIds ref
 * only guards against firing twice for the same milestone from back-to-back
 * refetches inside the same freshness window.
 */
export function MilestoneCelebrationController() {
  const { t } = useTranslation();
  const milestones = useWatchMilestones();
  const { celebrate } = useConfetti();
  const celebratedIds = useRef(new Set<string>());

  useEffect(() => {
    if (!milestones.data) return;
    const now = Date.now();

    for (const milestone of milestones.data) {
      if (!milestone.achieved || !milestone.achievedAt) continue;
      if (celebratedIds.current.has(milestone.id)) continue;

      const achievedAt = new Date(milestone.achievedAt).getTime();
      if (Number.isNaN(achievedAt) || now - achievedAt > MILESTONE_CELEBRATION_WINDOW_MS) continue;

      celebratedIds.current.add(milestone.id);
      celebrate();
      toast({
        title: t("stats.milestones.cardTitle"),
        description: t(MILESTONE_THRESHOLD_KEY[milestone.category], { count: milestone.threshold }),
        variant: "success",
      });
    }
  }, [milestones.data, celebrate, t]);

  return null;
}
