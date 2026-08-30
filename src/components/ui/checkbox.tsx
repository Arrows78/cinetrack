import * as React from "react";
import { cn } from "@/shared/lib/cn";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size">;

// A plain native checkbox with accent-color styling only — the native
// control already has full keyboard/screen-reader semantics built in, so
// no custom ARIA wiring is needed. Deliberately minimal: it backs one thing
// (the Library Health Center's bulk-select rows), not a showcase-grade
// tri-state/indeterminate control.
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
