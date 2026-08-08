import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

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
        <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-background/80 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-modal w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-shell border border-border bg-background/95 p-5 shadow-2xl focus:outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="font-display text-lg font-bold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
