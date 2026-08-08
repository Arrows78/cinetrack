import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/shared/lib/cn";

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "card" | "subtle" | "highlight";
  asChild?: boolean;
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, tone = "card", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(
          "rounded-panel border p-5",
          tone === "card" && "border-border bg-card/60",
          tone === "subtle" && "border-border bg-foreground/[0.03]",
          // Draws attention to a single standout stat or callout (e.g. a
          // forecast/wrapped figure next to otherwise-neutral Panels).
          tone === "highlight" && "border-primary/30 bg-primary/5",
          className
        )}
        {...props}
      />
    );
  }
);
Panel.displayName = "Panel";
