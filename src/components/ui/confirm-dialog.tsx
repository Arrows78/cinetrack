import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";
import { DIALOG_OVERLAY_CLASSNAME } from "@/components/ui/sheet";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  isConfirming?: boolean;
  confirmVariant?: ButtonProps["variant"];
}

/**
 * Generic destructive-action confirmation modal. Every irreversible action
 * in the app (deleting a list, removing a library entry, overwriting data
 * on backup import, ...) should route through this rather than firing on
 * click — see the audit that flagged the app had none of these anywhere.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  isConfirming = false,
  confirmVariant = "destructive",
}: ConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASSNAME} />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-modal flex max-h-[85vh] w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-shell border border-border bg-background/95 p-5 shadow-2xl focus:outline-none">
          <DialogPrimitive.Title className="shrink-0 font-display text-lg font-bold">{title}</DialogPrimitive.Title>
          {description ? (
            // min-h-0 lets this shrink below its content's intrinsic height
            // (the flexbox default is min-height:auto, which would otherwise
            // ignore max-h-[85vh] on the parent and keep growing) — without
            // it, an unexpectedly long description (e.g. a generated list of
            // names) grew the dialog past the viewport, and with a fixed
            // top-1/2/-translate-y-1/2 position that pushed the title and
            // buttons off-screen entirely instead of just looking cramped.
            <DialogPrimitive.Description className="mt-2 min-h-0 overflow-y-auto text-sm leading-6 text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming}>
              {cancelLabel}
            </Button>
            <Button type="button" variant={confirmVariant} isLoading={isConfirming} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
