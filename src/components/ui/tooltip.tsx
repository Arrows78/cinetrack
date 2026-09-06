import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/shared/lib/cn";

export function TooltipProvider(props: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider {...props} />;
}

export function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />;
}

export const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>((props, ref) => <TooltipPrimitive.Trigger ref={ref} {...props} />);
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-tooltip overflow-hidden rounded-lg border border-border bg-card px-2.5 py-1.5 text-caption font-medium text-card-foreground shadow-elevation-lg",
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
  // buttonVariants applies `disabled:pointer-events-none`, so a disabled
  // trigger never receives the hover (or focus) that would open this
  // tooltip — precisely when it's most needed, to explain *why* the
  // control is inactive. Wrapping only the disabled case in a focusable
  // span (itself never pointer-events:none) gives Radix something to
  // attach the hover/focus listeners to, without adding an extra tab stop
  // to every other tooltip in the app.
  const isDisabled = React.isValidElement(children) && Boolean((children.props as { disabled?: boolean }).disabled);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {isDisabled ? (
            // Deliberately focusable: this span exists precisely so a
            // keyboard/hover user can reach this tooltip when the real
            // control inside it is disabled and therefore unfocusable.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            <span className="inline-flex" tabIndex={0}>
              {children}
            </span>
          ) : (
            children
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
