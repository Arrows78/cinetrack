import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { buttonVariants } from "@/components/ui/button-variants";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and disables the button. Ignored when `asChild` is set — Slot requires a single child. */
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, disabled, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
