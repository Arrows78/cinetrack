import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

// Other props (role, aria-label…) pass through so a skeleton standing in for a
// whole section can announce itself as a loading status.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-foreground/5", className)} {...props}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-black/5 to-transparent dark:via-white/10" />
    </div>
  );
}
