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
