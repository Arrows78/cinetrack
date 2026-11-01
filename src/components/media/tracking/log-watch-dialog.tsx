import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DIALOG_CONTENT_CLASSNAME, DIALOG_OVERLAY_CLASSNAME } from "@/components/ui/sheet";
import { toDateInputValue, watchedAtForDay } from "@/shared/utils/watch-date";

/**
 * Logs one watch with its date and an optional note — the command palette's
 * "Log a watch…". Like AddWatchNoteDialog, the note is written once, with
 * the watch itself; the date can be any day up to today (Rust refuses a
 * future one too).
 */
export function LogWatchDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The title being logged, named in the dialog's description. */
  title: string;
  onConfirm: (watch: { watchedAt: string; note: string }) => void;
}) {
  const { t } = useTranslation();
  const today = toDateInputValue(new Date());
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  // Same reset-on-close-without-an-effect as AddWatchNoteDialog.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setDay(today);
      setNote("");
    }
  }
  const validDay = Boolean(day) && day <= today;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASSNAME} />
        <DialogPrimitive.Content className={DIALOG_CONTENT_CLASSNAME}>
          <DialogPrimitive.Title className="shrink-0 font-display text-heading-sm font-bold">
            {t("media.logWatchTitle")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 shrink-0 text-body-sm leading-6 text-muted-foreground">
            {t("media.logWatchDescription", { title })}
          </DialogPrimitive.Description>
          <label className="mt-4 grid gap-2 text-body-sm font-medium">
            {t("media.logWatchDateLabel")}
            <Input type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} />
          </label>
          <Textarea
            className="mt-4 min-h-24"
            aria-label={t("media.addWatchNoteLabel")}
            placeholder={t("media.addWatchNotePlaceholder")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!validDay}
              onClick={() => onConfirm({ watchedAt: watchedAtForDay(day), note: note.trim() })}
            >
              {t("media.logWatchConfirm")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
