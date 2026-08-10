import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** Inline "this section is loading" text — for a full-page loading screen, use LoadingScreen instead. */
export function LoadingState({ label, className }: LoadingStateProps) {
  const { t } = useTranslation();
  return <p className={cn("text-sm text-muted-foreground", className)}>{label ?? t("common.loading")}</p>;
}
