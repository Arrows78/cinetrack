import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/cn";

interface PartialErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * For when some data loaded but a secondary/partial fetch failed — as
 * opposed to RemoteErrorState, which replaces the whole page. Renders a
 * plain inline note, or a bordered box with a retry action when `onRetry`
 * is provided.
 */
export function PartialErrorState({ message, onRetry, className }: PartialErrorStateProps) {
  const { t } = useTranslation();

  if (!onRetry) {
    return <p className={cn("text-xs text-destructive", className)}>{message}</p>;
  }

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive",
        className
      )}
    >
      <span>{message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("errors.retry")}
      </Button>
    </div>
  );
}
