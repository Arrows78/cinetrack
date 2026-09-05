import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DIALOG_OVERLAY_CLASSNAME } from "@/components/ui/sheet";

/**
 * Asks whether marking one episode watched should also catch up the
 * still-unwatched episodes before it in the same season — surfaced by
 * useEpisodeSeenBacklogPrompt whenever such episodes exist. Not a
 * ConfirmDialog: both choices are constructive (mark one, or mark several),
 * not a destructive action needing a cancel path — closing the dialog
 * without picking either just leaves everything untouched.
 */
export function MarkPreviousEpisodesDialog({
  open,
  onOpenChange,
  previousCount,
  onOnlyThis,
  onIncludePrevious,
  isApplying,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previousCount: number;
  onOnlyThis: () => void;
  onIncludePrevious: () => void;
  isApplying?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASSNAME} />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-modal flex max-h-[85vh] w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-shell border border-border bg-background/95 p-5 shadow-2xl focus:outline-none">
          <DialogPrimitive.Title className="shrink-0 font-display text-lg font-bold">
            {t("media.markPreviousTitle")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("media.markPreviousDescription", { count: previousCount })}
          </DialogPrimitive.Description>
          <div className="mt-5 flex shrink-0 flex-col gap-2">
            <Button type="button" isLoading={isApplying} onClick={onIncludePrevious}>
              {t("media.markPreviousIncludeCta", { count: previousCount })}
            </Button>
            <Button type="button" variant="outline" disabled={isApplying} onClick={onOnlyThis}>
              {t("media.markPreviousOnlyThisCta")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
