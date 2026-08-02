import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/shared/lib/cn";

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "card" | "subtle";
  asChild?: boolean;
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, tone = "card", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(
          "rounded-panel border border-border p-5",
          tone === "card" && "bg-card/60",
          tone === "subtle" && "bg-foreground/[0.03]",
          className
        )}
        {...props}
      />
    );
  }
);
Panel.displayName = "Panel";
