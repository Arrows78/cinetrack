import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Confirmation for the bulk "mark as unwatched" actions (a whole season or a
 * whole series). Unwatching deletes each episode's progress row — its own
 * rating and its original watch date go with it, and re-marking only
 * stamps "now" — so unlike a single-episode toggle this can't be undone by
 * clicking again.
 */
export function ConfirmUnmarkDialog({
  scope,
  open,
  onOpenChange,
  onConfirm,
}: {
  scope: "season" | "series";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(scope === "season" ? "series.unmarkSeasonConfirmTitle" : "series.unmarkSeriesConfirmTitle")}
      description={t(
        scope === "season" ? "series.unmarkSeasonConfirmDescription" : "series.unmarkSeriesConfirmDescription"
      )}
      confirmLabel={t("series.unmarkConfirm")}
      cancelLabel={t("common.cancel")}
      onConfirm={onConfirm}
    />
  );
}
