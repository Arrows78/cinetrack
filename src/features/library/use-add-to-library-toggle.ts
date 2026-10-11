import { useState } from "react";
import { useIsInLibrary, useLibraryQuickToggle } from "@/features/library/use-library";
import { logger } from "@/shared/lib/logger";
import type { MediaSummary } from "@/types/media";

// Shared by the grid card's bookmark icon and the detail-page button — same
// toggle, same fallback when the quick removal is blocked. Removing a title
// with real progress (anything past the default "planned" status) used to
// be a dead end: a toast saying "can't remove it here" with no way to
// actually finish the job short of navigating to the title's own page and
// finding LibraryEditor's separate Remove button. This offers the same
// confirmed removal right where the user already is instead.
export function useAddToLibraryToggle(media: MediaSummary, options?: { enabled?: boolean }) {
  const { data: isInLibrary } = useIsInLibrary(media.id, media.mediaType, { enabled: options?.enabled ?? true });
  const { addPlanned, removeIfPlanned, forceRemove, isSaving } = useLibraryQuickToggle();
  const [confirmingForceRemove, setConfirmingForceRemove] = useState(false);

  // Every caller fires this from a click handler without awaiting it, so a
  // failed write must not escape as an unhandled rejection. The user-facing
  // toast comes from the app-wide MutationCache error handler (see
  // query-client.ts); this only keeps the failure in the log.
  const toggle = async () => {
    try {
      if (isInLibrary) {
        const removed = await removeIfPlanned({ mediaId: media.id, mediaType: media.mediaType });
        if (!removed) setConfirmingForceRemove(true);
        return;
      }
      await addPlanned(media);
    } catch (error) {
      logger.error(`Library toggle failed for ${media.mediaType} ${media.id}: ${error}`);
    }
  };

  // Awaited before closing (not "close, then fire and forget") so the
  // dialog's own isConfirming can actually show while the removal is in
  // flight, and so a double-click on the confirm button can't queue the
  // same removal twice. On failure the dialog stays open so the user can
  // retry — the app-wide MutationCache error handler (see query-client.ts)
  // already surfaces the toast, so there's nothing left to do here besides
  // not leaving the rejection unhandled.
  const confirmForceRemove = async () => {
    try {
      await forceRemove({ mediaId: media.id, mediaType: media.mediaType });
      setConfirmingForceRemove(false);
    } catch {
      // Handled above.
    }
  };

  return {
    isInLibrary: Boolean(isInLibrary),
    toggle,
    isSaving,
    confirmingForceRemove,
    setConfirmingForceRemove,
    confirmForceRemove,
  };
}
