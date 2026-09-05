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
