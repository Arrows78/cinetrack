import { useState } from "react";
import { useIsInLibrary, useLibraryQuickToggle } from "@/features/library/use-library";
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
  const { addPlanned, removeIfPlanned, forceRemove, isMutating } = useLibraryQuickToggle();
  const [confirmingForceRemove, setConfirmingForceRemove] = useState(false);

  const toggle = async () => {
    if (isInLibrary) {
      const removed = await removeIfPlanned({ mediaId: media.id, mediaType: media.mediaType });
      if (!removed) setConfirmingForceRemove(true);
      return;
    }
    await addPlanned(media);
  };

  const confirmForceRemove = () => {
    void forceRemove({ mediaId: media.id, mediaType: media.mediaType });
    setConfirmingForceRemove(false);
  };

  return {
    isInLibrary: Boolean(isInLibrary),
    toggle,
    isMutating,
    confirmingForceRemove,
    setConfirmingForceRemove,
    confirmForceRemove,
  };
}
