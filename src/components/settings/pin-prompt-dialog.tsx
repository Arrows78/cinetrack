import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIALOG_CONTENT_CLASSNAME, DIALOG_OVERLAY_CLASSNAME } from "@/components/ui/sheet";

export interface PinPromptDialogProps {
  open: boolean;
  profileName: string;
  onOpenChange: (open: boolean) => void;
  onVerify: (pin: string) => Promise<boolean>;
  onSuccess: () => void;
}

/**
 * Credential entry, not a destructive-action confirmation — deliberately
 * not built on ConfirmDialog (that component's copy/props are shaped for
 * "are you sure", not "prove you're allowed"). Built directly on the same
 * Radix primitive + classnames ConfirmDialog itself uses, for visual
 * consistency with every other modal in this app.
 */
export function PinPromptDialog({ open, profileName, onOpenChange, onVerify, onSuccess }: PinPromptDialogProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const reset = () => {
    setPin("");
    setError(false);
    setIsVerifying(false);
  };

  const submit = async () => {
    setIsVerifying(true);
    try {
      const ok = await onVerify(pin);
      if (ok) {
        reset();
        onSuccess();
      } else {
        setError(true);
        setPin("");
        setIsVerifying(false);
      }
    } catch {
      setError(true);
      setPin("");
      setIsVerifying(false);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASSNAME} />
        <DialogPrimitive.Content className={DIALOG_CONTENT_CLASSNAME}>
          <DialogPrimitive.Title className="shrink-0 font-display text-heading-sm font-bold">
            {t("settings.profiles.pinPrompt.title", { name: profileName })}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-body-sm text-muted-foreground">
            {t("settings.profiles.pinPrompt.description")}
          </DialogPrimitive.Description>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Input
              size="sm"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError(false);
              }}
              aria-label={t("settings.profiles.pinPrompt.inputLabel")}
              aria-invalid={error}
              maxLength={6}
            />
            {error ? (
              <p role="alert" aria-live="polite" className="text-body-sm text-destructive">
                {t("settings.profiles.pinPrompt.error")}
              </p>
            ) : null}
            <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isVerifying}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" isLoading={isVerifying} disabled={pin.length < 4}>
                {t("settings.profiles.pinPrompt.confirm")}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
