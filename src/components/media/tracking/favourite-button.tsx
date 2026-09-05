import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { useLibraryItem } from "@/features/library/use-library";
import type { MediaSummary } from "@/types/media";

/**
 * A top-of-page quick toggle, alongside AddToLibraryButton/
 * AvailabilityAlertButton — favouriting is a frequent, lightweight action
 * that shouldn't need scrolling down to LibraryEditor's form. Saves
 * immediately (no separate Save step), the same way those two siblings do;
 * LibraryEditor no longer renders its own favourite control at all, so
 * there's exactly one place this can drift from the real value.
 *
 * Toggling still works for a title not yet in the library: save() upserts a
 * fresh entry (defaulting to "planned") the same way any other LibraryEditor
 * field already does.
 */
export function FavouriteButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const library = useLibraryItem(media);
  const favourite = library.data?.favourite ?? false;

  return (
    <IconTooltip label={t("library.favourite")}>
      <Button
        type="button"
        variant={favourite ? "default" : "outline"}
        size="icon"
        aria-label={t("library.favourite")}
        aria-pressed={favourite}
        disabled={library.isLoading || library.isSaving}
        onClick={() => void library.save({ favourite: !favourite })}
      >
        <Heart className={favourite ? "size-4 fill-current" : "size-4"} />
      </Button>
    </IconTooltip>
  );
}
