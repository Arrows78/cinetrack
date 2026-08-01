import { cn } from "@/shared/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-black/5 dark:bg-white/5", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-black/5 to-transparent dark:via-white/10" />
    </div>
  );
}
