import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { useIsInLibrary, useLibraryQuickToggle } from "@/features/library/use-library";
import type { MediaSummary } from "@/types/media";

export function AddToLibraryButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const { data: isInLibrary } = useIsInLibrary(media.id, media.mediaType);
  const { addPlanned, removeIfPlanned, isMutating } = useLibraryQuickToggle();

  const toggle = async () => {
    if (isInLibrary) {
      const removed = await removeIfPlanned({ mediaId: media.id, mediaType: media.mediaType });
      if (!removed) {
        toast({ description: t("media.libraryRemoveBlocked"), variant: "error" });
      }
      return;
    }

    await addPlanned(media);
  };

  return (
    <Button variant={isInLibrary ? "secondary" : "default"} onClick={() => void toggle()} disabled={isMutating}>
      {isInLibrary ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {isInLibrary ? t("media.inLibrary") : t("media.addToLibrary")}
    </Button>
  );
}
