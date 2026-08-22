import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export interface ActiveFilterChip {
  /** Stable per-condition key (e.g. "status", "genre") — used as the React key, not shown. */
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * A row of removable chips, one per non-default filter condition currently
 * applied to a page (Library or Search) — sits directly above that page's
 * results. Each chip's own "x" clears just that one condition, leaving every
 * other filter untouched; callers compute `chips` from whatever filter
 * controls that page already has (see library-explorer.tsx/search-page.tsx),
 * so this component never invents new filter dimensions of its own.
 */
export function ActiveFilterChips({ chips }: { chips: ActiveFilterChip[] }) {
  const { t } = useTranslation();

  if (!chips.length) return null;

  return (
    <div role="group" aria-label={t("filters.activeFiltersLabel")} className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="outline" className="gap-1.5 py-1 pl-3 pr-1.5">
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={t("filters.removeFilter", { filter: chip.label })}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
