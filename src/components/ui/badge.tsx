import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/cn";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors", {
  variants: {
    variant: {
      default: "bg-primary/20 text-primary",
      secondary: "bg-secondary text-secondary-foreground",
      outline: "border border-border text-muted-foreground",
      success: "bg-success text-success-foreground",
      warning: "bg-warning text-warning-foreground",
      destructive: "bg-destructive text-destructive-foreground",
      // Media-type chip (movie vs series), used both in the detail hero and
      // over poster art (add backdrop-blur-sm via className for the latter).
      movie: "bg-primary/80 text-primary-foreground",
      series: "bg-accent/80 text-accent-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";

export { Badge };
