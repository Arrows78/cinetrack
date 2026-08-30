import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ButtonProps } from "@/components/ui/button";

export interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: ButtonProps["variant"];
  disabled?: boolean;
}

/** Selected-count + action buttons row, shared by every Library Health Center card that offers a bulk action. */
export function BulkActionBar({ selectedCount, actions }: { selectedCount: number; actions: BulkAction[] }) {
  const { t } = useTranslation();
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2">
      <p className="text-sm font-medium">{t("library.health.selectedCount", { count: selectedCount })}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            size="sm"
            variant={action.variant ?? "outline"}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
