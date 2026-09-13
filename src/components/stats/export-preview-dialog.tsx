import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DIALOG_CONTENT_CLASSNAME, DIALOG_OVERLAY_CLASSNAME } from "@/components/ui/sheet";
import { isMobileApp } from "@/shared/lib/platform";

export interface ExportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Object URL for the already-rendered card (see wrapped-export.ts's render*Card functions) — null while it's still being generated. */
  imageUrl: string | null;
  onConfirm: () => void;
  isConfirming?: boolean;
}

/**
 * Shown between a Wrapped/monthly-recap/milestone card being rendered and it
 * being saved — every one of those export flows used to go straight from a
 * click to a blind download, generating a shareable image the user had
 * never actually seen. Same dialog shape as ConfirmDialog, but the
 * confirming action is a save/share rather than a destructive one, so it
 * isn't routed through that component (whose default variant and framing
 * are specifically for irreversible actions).
 */
export function ExportPreviewDialog({
  open,
  onOpenChange,
  title,
  imageUrl,
  onConfirm,
  isConfirming = false,
}: ExportPreviewDialogProps) {
  const { t } = useTranslation();
  const confirmLabel = isMobileApp() ? t("common.share") : t("common.download");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !isConfirming && onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASSNAME} />
        <DialogPrimitive.Content className={DIALOG_CONTENT_CLASSNAME}>
          <DialogPrimitive.Title className="shrink-0 font-display text-heading-sm font-bold">
            {title}
          </DialogPrimitive.Title>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-card border border-border bg-foreground/[0.02]">
            {imageUrl ? (
              <img src={imageUrl} alt={title} className="w-full rounded-card object-contain" />
            ) : (
              <div className="aspect-[4/5] w-full animate-pulse" aria-hidden="true" />
            )}
          </div>
          <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming}>
              {t("common.cancel")}
            </Button>
            <Button type="button" isLoading={isConfirming} disabled={!imageUrl} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
