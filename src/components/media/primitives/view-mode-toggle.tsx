import { useTranslation } from "react-i18next";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";

/** LibraryExplorer's grid/list switch — the app's one shared view-mode toggle, persisted via preferences.libraryViewMode. */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: "grid" | "list";
  onChange: (mode: "grid" | "list") => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 rounded-full border border-border p-1">
      <IconTooltip label={t("library.gridView")}>
        <Button
          type="button"
          variant={value === "grid" ? "default" : "ghost"}
          size="icon"
          aria-label={t("library.gridView")}
          aria-pressed={value === "grid"}
          onClick={() => onChange("grid")}
          className="size-8 rounded-full"
        >
          <LayoutGrid className="size-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={t("library.listView")}>
        <Button
          type="button"
          variant={value === "list" ? "default" : "ghost"}
          size="icon"
          aria-label={t("library.listView")}
          aria-pressed={value === "list"}
          onClick={() => onChange("list")}
          className="size-8 rounded-full"
        >
          <List className="size-4" />
        </Button>
      </IconTooltip>
    </div>
  );
}
