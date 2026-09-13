import { useTranslation } from "react-i18next";
import { ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { useDismissedRecommendations } from "@/features/recommendations/use-recommendations";
import { logger } from "@/shared/lib/logger";
import { displayMessage } from "@/shared/lib/user-facing-error";
import type { MediaSummary } from "@/types/media";

/**
 * "Pas intéressé" — excludes this title from Watch Tonight and the Home
 * page's recommendation rails (see filterDismissedByKeySet's callers).
 * Reversible from Settings' "Hidden titles" list, not from a toast undo —
 * this is a quiet, low-stakes action, not one that needs ConfirmDialog
 * (nothing is deleted, and it's fully undoable at any time).
 */
export function NotInterestedButton({ media, onDismissed }: { media: MediaSummary; onDismissed?: () => void }) {
  const { t } = useTranslation();
  const { dismiss, isDismissing } = useDismissedRecommendations();
  const label = t("recommendations.notInterested");

  return (
    <IconTooltip label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={label}
        disabled={isDismissing}
        onClick={() => {
          dismiss({ id: media.id, mediaType: media.mediaType, title: media.title, posterPath: media.posterPath })
            .then(() => {
              toast({ description: t("recommendations.dismissedToast", { title: media.title }), variant: "success" });
              onDismissed?.();
            })
            .catch((error: unknown) => {
              logger.warn(
                `Failed to dismiss recommendation: ${error instanceof Error ? error.message : String(error)}`
              );
              toast({ description: displayMessage(error, t("recommendations.dismissFailed")), variant: "error" });
            });
        }}
      >
        <ThumbsDown className="size-4" />
      </Button>
    </IconTooltip>
  );
}
