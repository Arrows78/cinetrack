import type { ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/cn";

// The icon-prefixed underline field (email, profile name) — was
// copy-pasted identically in both files. Not used by the OTP step, which
// has its own boxed (not underlined) input design. The underline itself is
// drawn by this row, not by the Input — the "underline" size just strips
// Input's own box/ring so the row's border reads as one continuous line
// under both the icon and the text.
export function AuthTextField({
  icon: Icon,
  rowClassName,
  ...inputProps
}: Omit<ComponentPropsWithoutRef<"input">, "size"> & { icon: LucideIcon; rowClassName?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-white/45 px-2 pb-3 focus-within:border-primary",
        rowClassName
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-auth-foreground/75" aria-hidden="true" />
      <Input
        size="underline"
        {...inputProps}
        className="w-full min-w-0 flex-1 text-auth-foreground placeholder:text-auth-foreground/35"
      />
    </div>
  );
}
