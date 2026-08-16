import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/cn";

const inputVariants = cva(
  "flex w-full border border-border text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        // Prominent inputs (search-bar.tsx).
        default: "h-11 rounded-2xl bg-card/70 px-4 py-2 text-sm",
        // Compact form fields (settings, filters, editors) — no explicit
        // text size, matching the hand-rolled markup this variant replaces.
        sm: "h-10 rounded-xl bg-background px-3",
        // Borderless field for a row that draws its own underline (see
        // auth-text-field.tsx) — no box, no ring, just the bare text.
        underline: "h-auto rounded-none border-0 bg-transparent px-0 py-0 text-xl ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface InputProps extends Omit<React.ComponentProps<"input">, "size">, VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, size, ...props }, ref) => {
  return <input type={type} className={cn(inputVariants({ size }), className)} ref={ref} {...props} />;
});
Input.displayName = "Input";

export { Input };
