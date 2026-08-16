import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";

// The wrapper (not the <select> itself) carries the visible box — border,
// background, radius — so it can render its own chevron over a
// native-appearance:none select and still look like an Input/Button of the
// same size (a bare <select> renders the platform's own arrow glyph, which
// never matches the rest of the design system). Every stateful variant below
// keys off the inner select via `has-*` since focus/disabled/aria-invalid
// land on that element, not the wrapper.
const selectVariants = cva(
  "relative w-full rounded-xl border border-border bg-background ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:has-[:focus-visible]:ring-destructive/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
  {
    variants: {
      size: {
        default: "h-10",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface SelectProps
  extends Omit<React.ComponentProps<"select">, "size">, VariantProps<typeof selectVariants> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, size, ...props }, ref) => (
  <div className={cn(selectVariants({ size }), className)}>
    <select
      ref={ref}
      className="h-full w-full cursor-pointer appearance-none bg-transparent px-3 pr-9 text-sm text-foreground outline-none disabled:cursor-not-allowed"
      {...props}
    />
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
));
Select.displayName = "Select";

export { Select };
