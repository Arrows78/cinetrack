import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { useSavedFilters } from "@/features/saved-filters/use-saved-filters";
import type { SavedFilterPage, SavedFilterState } from "@/types/media";

const MAX_SAVED_FILTER_NAME_LENGTH = 100;

/**
 * Save-the-current-view / reopen-a-saved-view bar, shared by LibraryExplorer
 * and SearchPage — the two only differ in `page` (which scopes storage, see
 * src-tauri/src/lists/saved_filters/) and in the shape of `TState`
 * (LibraryFilterState vs SearchFilterState). Clicking a saved filter's name
 * calls `onApply` with the exact object that was captured at save time —
 * reopening a saved filter is entirely client-side, there is no
 * "evaluate against the library" step (unlike smart lists).
 */
export function SavedFiltersBar<TState extends SavedFilterState>({
  page,
  currentFilters,
  onApply,
}: {
  page: SavedFilterPage;
  currentFilters: TState;
  onApply: (filters: TState) => void;
}) {
  const { t } = useTranslation();
  const savedFilters = useSavedFilters<TState>(page);
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; name: string } | null>(null);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaveError(null);
    void savedFilters
      .create({ name: trimmed, filters: currentFilters })
      .then(() => setName(""))
      .catch(() => setSaveError(t("filters.savedFilters.saveFailed")));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {savedFilters.data?.map((saved) => (
          <Tile key={saved.id} className="flex items-center gap-1 rounded-full py-1 pl-3 pr-1">
            <button
              type="button"
              className="text-sm font-medium text-foreground transition-colors hover:text-primary"
              onClick={() => onApply(saved.filters)}
            >
              {saved.name}
            </button>
            <IconTooltip label={t("filters.savedFilters.delete", { name: saved.name })}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("filters.savedFilters.delete", { name: saved.name })}
                className="size-6 rounded-full"
                onClick={() => setPendingRemoval({ id: saved.id, name: saved.name })}
              >
                <Trash2 className="size-3" />
              </Button>
            </IconTooltip>
          </Tile>
        ))}
        <Input
          size="sm"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("filters.savedFilters.namePlaceholder")}
          aria-label={t("filters.savedFilters.nameLabel")}
          maxLength={MAX_SAVED_FILTER_NAME_LENGTH}
          className="max-w-48"
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSave();
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={!name.trim()} onClick={handleSave}>
          <BookmarkPlus className="mr-2 size-4" />
          {t("filters.savedFilters.save")}
        </Button>
      </div>
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
      {removeError ? <p className="text-sm text-destructive">{removeError}</p> : null}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={t("filters.savedFilters.deleteConfirmTitle", { name: pendingRemoval?.name })}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingRemoval) return;
          setRemoveError(null);
          void savedFilters
            .remove(pendingRemoval.id)
            .catch(() => setRemoveError(t("filters.savedFilters.deleteFailed")));
          setPendingRemoval(null);
        }}
      />
    </div>
  );
}
