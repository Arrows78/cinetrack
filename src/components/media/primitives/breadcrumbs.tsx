import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/**
 * Generic breadcrumb trail — each item is caller-supplied markup (a Link for
 * an ancestor, a plain aria-current="page" span for the current one) rather
 * than a {label, to} shape, so this stays free of any one route's typed
 * Link params instead of trying to type every possible destination.
 */
export function Breadcrumbs({ items, className }: { items: ReactNode[]; className?: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("common.breadcrumbLabel")} className={cn("text-body-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            {item}
          </li>
        ))}
      </ol>
    </nav>
  );
}
