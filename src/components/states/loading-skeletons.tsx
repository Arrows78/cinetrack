import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { MEDIA_GRID_CLASS_NAME } from "@/components/media/primitives/media-grid";

export function GridSkeleton({ count = 10 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")} className={MEDIA_GRID_CLASS_NAME}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="aspect-[2/3] rounded-card" />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")}>
      <Skeleton className="h-[28.75rem] rounded-hero" />
    </div>
  );
}

/** History page's activity timeline — one icon-dot + connector segment + two text lines per row, matching the real row's geometry (see history-page.tsx). */
export function TimelineSkeleton({ count = 6 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")} className="space-y-5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="relative flex gap-4">
          <div className="relative shrink-0">
            {index !== count - 1 && (
              <div className="absolute left-[1.1875rem] top-2 -bottom-5 w-px bg-foreground/[0.07]" />
            )}
            <Skeleton className="h-[2.375rem] w-[2.375rem] rounded-full" />
          </div>
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** History page's tracked-series list — a Tile row per item, matching the real title/progress-bar geometry (see history-page.tsx). */
export function TrackedSeriesSkeleton({ count = 4 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")} className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl bg-foreground/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-10 shrink-0" />
          </div>
          <Skeleton className="mt-3 h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")} className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-panel" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-panel" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-panel" />
        <Skeleton className="h-48 rounded-panel" />
      </div>
    </div>
  );
}
