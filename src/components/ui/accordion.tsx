import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  Accordion,
  AccordionItemPrimitive,
  AccordionTriggerPrimitive,
  AccordionContentPrimitive,
  AccordionHeaderPrimitive,
} from "./accordion-primitives";

export { Accordion };

export const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionItemPrimitive>,
  React.ComponentPropsWithoutRef<typeof AccordionItemPrimitive>
>(({ className, ...props }, ref) => (
  <AccordionItemPrimitive
    ref={ref}
    className={cn("rounded-3xl border border-border bg-card/40", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

export const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionTriggerPrimitive>,
  React.ComponentPropsWithoutRef<typeof AccordionTriggerPrimitive>
>(({ className, children, ...props }, ref) => (
  <AccordionHeaderPrimitive className="flex">
    <AccordionTriggerPrimitive
      ref={ref}
      className={cn(
        "group flex flex-1 items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium transition-all hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-fast group-data-[state=open]:rotate-180" />
    </AccordionTriggerPrimitive>
  </AccordionHeaderPrimitive>
));
AccordionTrigger.displayName = "AccordionTrigger";

export const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionContentPrimitive>,
  React.ComponentPropsWithoutRef<typeof AccordionContentPrimitive>
>(({ className, children, ...props }, ref) => (
  <AccordionContentPrimitive
    ref={ref}
    className={cn(
      "overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
      className
    )}
    {...props}
  >
    <div className="px-5 pb-5">{children}</div>
  </AccordionContentPrimitive>
));
AccordionContent.displayName = "AccordionContent";
