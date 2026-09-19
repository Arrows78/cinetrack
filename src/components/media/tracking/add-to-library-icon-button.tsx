import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { useAddToLibraryToggle } from "@/features/library/use-add-to-library-toggle";
import { cn } from "@/shared/lib/cn";
import type { MediaSummary } from "@/types/media";

const sizeClasses = { sm: "h-9 w-9", md: "h-11 w-11" } as const;
const iconSizeClasses = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

/**
 * Compact, bordered-circle counterpart to AddToLibraryButton (the full-size
 * hero button) and MediaCard's own poster-overlay bookmark chip — same
 * useAddToLibraryToggle underneath, styled for a row rather than a poster
 * overlay or a hero, same visual language as SeenToggleButton next to it
 * (list rows, compact contexts).
 */
export function AddToLibraryIconButton({ media, size = "md" }: { media: MediaSummary; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const { isInLibrary, toggle, isSaving, confirmingForceRemove, setConfirmingForceRemove, confirmForceRemove } =
    useAddToLibraryToggle(media);
  const label = isInLibrary ? t("media.inLibrary") : t("media.addToLibrary");

  return (
    <>
      <IconTooltip label={label}>
        <button
          type="button"
          aria-label={label}
          aria-pressed={isInLibrary}
          disabled={isSaving}
          onClick={() => void toggle()}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            sizeClasses[size],
            isInLibrary
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
          )}
        >
          {isInLibrary ? (
            <BookmarkCheck className={iconSizeClasses[size]} />
          ) : (
            <Bookmark className={iconSizeClasses[size]} />
          )}
        </button>
      </IconTooltip>
      <ConfirmDialog
        open={confirmingForceRemove}
        onOpenChange={(open) => !open && !isSaving && setConfirmingForceRemove(open)}
        title={t("library.removeConfirmTitle")}
        description={t("library.removeConfirmDescription")}
        confirmLabel={t("library.remove")}
        cancelLabel={t("common.cancel")}
        isConfirming={isSaving}
        onConfirm={() => void confirmForceRemove()}
      />
    </>
  );
}
