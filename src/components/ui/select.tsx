import * as React from "react";
import { cn } from "@/shared/lib/cn";

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 rounded-xl border border-border bg-background px-3 text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Select.displayName = "Select";

export { Select };
