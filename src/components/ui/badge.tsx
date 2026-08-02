import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/cn";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors", {
  variants: {
    variant: {
      default: "bg-primary/20 text-primary",
      secondary: "bg-secondary text-secondary-foreground",
      outline: "border border-border text-muted-foreground",
      // Media-type chip, hero/detail context (media-details-hero.tsx).
      movie: "bg-primary/80 text-primary-foreground",
      series: "bg-accent/80 text-foreground",
      // Media-type chip, poster-overlay context (media-card.tsx) — sits on
      // arbitrary poster art, so it needs its own legibility treatment
      // (backdrop blur via className, a dark ring instead of accent for
      // series) rather than sharing movie/series's hero colors.
      "movie-overlay": "bg-primary/85 text-primary-foreground",
      "series-overlay": "bg-black/50 text-white/90 ring-1 ring-white/20",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
