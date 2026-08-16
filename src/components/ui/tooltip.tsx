import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/shared/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-tooltip overflow-hidden rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-card-foreground shadow-elevation-lg",
        "data-[state=delayed-open]:animate-tooltip-in data-[state=closed]:animate-tooltip-out",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Covers the overwhelming majority of this app's tooltip need — an
// icon-only control's hover label — without repeating the
// Provider/Root/Trigger/Content wiring at every call site. Reach for the
// primitives above directly only for a genuinely custom tooltip.
// Carries its own TooltipProvider (nesting inside the app-root one, set at
// App.tsx, is harmless — Radix just uses the nearest) so a component using
// this doesn't crash when unit-tested in isolation, without the full app
// tree around it.
export function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
