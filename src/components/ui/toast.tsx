import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/shared/lib/cn";

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-0 right-0 z-toast flex max-h-screen w-full flex-col gap-2 p-4 sm:bottom-4 sm:right-4 sm:max-w-sm",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const toastVariants = cva(
  "pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border p-4 shadow-elevation-lg group data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:[animation:toast-in_var(--duration-base)_var(--ease-out-expo)_forwards] data-[state=closed]:[animation:toast-out_var(--duration-fast)_ease-in_forwards]",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        // text-success/text-destructive, not the *-foreground tokens: those
        // are calibrated for dark text on a solid, saturated fill (see
        // Badge's filled variants) — on this translucent /10 background,
        // paired with -foreground the text nearly disappears (dark-on-dark
        // in the dark theme, light-on-light in the light theme). Matches
        // the same bg-X/N + text-X pairing partial-error-state.tsx uses.
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        error: "border-destructive/30 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>, VariantProps<typeof toastVariants> {}

export const Toast = React.forwardRef<React.ElementRef<typeof ToastPrimitive.Root>, ToastProps>(
  ({ className, variant, ...props }, ref) => (
    <ToastPrimitive.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />
  )
);
Toast.displayName = ToastPrimitive.Root.displayName;

export const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

export const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description ref={ref} className={cn("mt-1 text-sm opacity-90", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

export const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close> & { closeLabel: string }
>(({ className, closeLabel, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-full p-1.5 opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100",
      className
    )}
    {...props}
  >
    <X className="size-4" aria-hidden="true" />
    <span className="sr-only">{closeLabel}</span>
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

export type ToastActionElement = React.ReactElement<typeof ToastAction>;

export const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "shrink-0 rounded-xl border border-border bg-transparent px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;
