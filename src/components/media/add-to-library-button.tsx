import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAddToLibraryToggle } from "@/features/library/use-add-to-library-toggle";
import type { MediaSummary } from "@/types/media";

export function AddToLibraryButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const { isInLibrary, toggle, isMutating, confirmingForceRemove, setConfirmingForceRemove, confirmForceRemove } =
    useAddToLibraryToggle(media);

  return (
    <>
      <Button variant={isInLibrary ? "secondary" : "default"} onClick={() => void toggle()} disabled={isMutating}>
        {isInLibrary ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {isInLibrary ? t("media.inLibrary") : t("media.addToLibrary")}
      </Button>
      <ConfirmDialog
        open={confirmingForceRemove}
        onOpenChange={setConfirmingForceRemove}
        title={t("library.removeConfirmTitle")}
        description={t("library.removeConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmForceRemove}
      />
    </>
  );
}
