import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const SCOPE_KEY = { episode: "Episode", season: "Season", series: "Series" } as const;

/**
 * Confirmation for "mark as unwatched" actions (a single episode that carries
 * a rating or a custom watch date, a swipe-triggered unmark, a whole season
 * or a whole series). Unwatching deletes each episode's progress row — its
 * own rating and its original watch date go with it, and re-marking only
 * stamps "now" — so this can't be undone by clicking again.
 */
export function ConfirmUnmarkDialog({
  scope,
  open,
  onOpenChange,
  onConfirm,
}: {
  scope: "episode" | "season" | "series";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`series.unmark${SCOPE_KEY[scope]}ConfirmTitle`)}
      description={t(`series.unmark${SCOPE_KEY[scope]}ConfirmDescription`)}
      confirmLabel={t("series.unmarkConfirm")}
      cancelLabel={t("common.cancel")}
      onConfirm={onConfirm}
    />
  );
}
