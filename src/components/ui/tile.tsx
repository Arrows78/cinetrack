import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/shared/lib/cn";

export interface TileProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

// Minimal bordered box for list rows and small nested blocks — a plainer,
// smaller sibling of Panel (rounded-xl vs rounded-panel, no default
// background or padding: every caller supplies its own via className, same
// convention Panel/Card already use for their overrides).
export const Tile = React.forwardRef<HTMLDivElement, TileProps>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "div";
  return <Comp ref={ref} className={cn("rounded-xl border border-border", className)} {...props} />;
});
Tile.displayName = "Tile";
