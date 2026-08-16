import type { ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

// The icon-prefixed underline field (email, profile name) — was
// copy-pasted identically in both files. Not used by the OTP step, which
// has its own boxed (not underlined) input design.
export function AuthTextField({
  icon: Icon,
  rowClassName,
  ...inputProps
}: ComponentPropsWithoutRef<"input"> & { icon: LucideIcon; rowClassName?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-white/45 px-2 pb-3 focus-within:border-primary",
        rowClassName
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-auth-foreground/75" aria-hidden="true" />
      <input
        {...inputProps}
        className="h-auto w-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xl text-auth-foreground outline-none placeholder:text-auth-foreground/35"
      />
    </div>
  );
}
