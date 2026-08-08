import { Skeleton } from "@/components/ui/skeleton";

export function GridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="aspect-[2/3] rounded-card" />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return <Skeleton className="h-[460px] rounded-hero" />;
}

export function StatsSkeleton() {
  return (
    <div className="space-y-8">
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
