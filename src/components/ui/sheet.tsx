import * as React from "react";
import type * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlayPrimitive,
  SheetTitlePrimitive,
  SheetDescriptionPrimitive,
  SheetContentPrimitive,
  SheetPortal,
} from "./sheet-primitives";

export type SheetSide = "left" | "right" | "top" | "bottom";
export type SheetSize = "sm" | "md" | "lg" | "xl";

export { Sheet, SheetTrigger, SheetClose };

const sideClasses: Record<SheetSide, string> = {
  left: "inset-y-0 left-0 h-full border-r",
  right: "inset-y-0 right-0 h-full border-l",
  top: "inset-x-0 top-0 w-full border-b",
  bottom: "inset-x-0 bottom-0 w-full border-t",
};

const horizontalSizeClasses: Record<SheetSize, string> = {
  sm: "w-[86%] max-w-sm",
  md: "w-[90%] max-w-md",
  lg: "w-[92%] max-w-lg",
  xl: "w-[94%] max-w-2xl",
};

const verticalSizeClasses: Record<SheetSize, string> = {
  sm: "h-[36vh] max-h-[36rem]",
  md: "h-[50vh] max-h-[44rem]",
  lg: "h-[66vh] max-h-[52rem]",
  xl: "h-[82vh] max-h-[60rem]",
};

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetOverlayPrimitive>,
  React.ComponentPropsWithoutRef<typeof SheetOverlayPrimitive>
>(({ className, ...props }, ref) => (
  <SheetOverlayPrimitive
    ref={ref}
    className={cn("fixed inset-0 z-overlay bg-background/80 backdrop-blur-sm", className)}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetTitlePrimitive>,
  React.ComponentPropsWithoutRef<typeof SheetTitlePrimitive>
>(({ className, ...props }, ref) => (
  <SheetTitlePrimitive ref={ref} className={cn("font-display text-lg font-bold", className)} {...props} />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetDescriptionPrimitive>,
  React.ComponentPropsWithoutRef<typeof SheetDescriptionPrimitive>
>(({ className, ...props }, ref) => (
  <SheetDescriptionPrimitive
    ref={ref}
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5 pr-10 text-left", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-auto flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

export type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  closeLabel?: string;
  side?: SheetSide;
  size?: SheetSize;
};

export const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  ({ className, children, closeLabel = "Close", side = "left", size = "sm", ...props }, ref) => {
    const isHorizontal = side === "left" || side === "right";

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetContentPrimitive
          ref={ref}
          data-side={side}
          data-size={size}
          className={cn(
            "fixed z-modal flex flex-col overflow-y-auto border-border bg-background/95 p-5 shadow-2xl focus:outline-none",
            sideClasses[side],
            isHorizontal ? horizontalSizeClasses[size] : verticalSizeClasses[size],
            className
          )}
          {...props}
        >
          {children}
          <SheetClose className="absolute right-4 top-4 rounded-full p-2 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{closeLabel}</span>
          </SheetClose>
        </SheetContentPrimitive>
      </SheetPortal>
    );
  }
);
SheetContent.displayName = "SheetContent";
