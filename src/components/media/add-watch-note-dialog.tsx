import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DIALOG_OVERLAY_CLASSNAME } from "@/components/ui/sheet";

/**
 * A small modal for attaching an optional per-watch note at the exact
 * moment a movie or a single episode gets marked watched. The backend
 * writes `note` once, in the same transaction as the watched-state
 * transition (see toggle_movie_seen_with_note_impl /
 * apply_episodes_and_log_impl in src-tauri/src/commands/progress.rs) — a
 * note can never be attached after the fact, so `onConfirm` here always
 * means "mark this watched, with this note", never an edit. Confirming
 * with an empty textarea is the same as marking watched without a note.
 */
export function AddWatchNoteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  // Resets the draft the moment `open` flips to false, without an effect
  // (see https://react.dev/learn/you-might-not-need-an-effect#adjusting-
  // some-state-when-a-prop-changes) — the caller closes this dialog itself
  // right after onConfirm fires, so this only ever clears a cancelled or
  // already-submitted draft, never one still being typed.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setNote("");
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASSNAME} />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-modal flex max-h-[85vh] w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col rounded-shell border border-border bg-background/95 p-5 shadow-2xl focus:outline-none">
          <DialogPrimitive.Title className="shrink-0 font-display text-lg font-bold">
            {t("media.addWatchNoteTitle")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 shrink-0 text-sm leading-6 text-muted-foreground">
            {t("media.addWatchNoteDescription")}
          </DialogPrimitive.Description>
          <Textarea
            className="mt-4 min-h-24"
            aria-label={t("media.addWatchNoteLabel")}
            placeholder={t("media.addWatchNotePlaceholder")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            autoFocus
          />
          <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => onConfirm(note.trim())}>
              {t("media.markAsSeen")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
