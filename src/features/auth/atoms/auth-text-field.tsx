import type { ComponentPropsWithoutRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/cn";

// Boxed to match the provider / email rows on the auth panel. The Input
// "underline" size still strips its own box/ring so this row is the only
// chrome around the icon and the text.
export function AuthTextField({
  icon: Icon,
  rowClassName,
  ...inputProps
}: Omit<ComponentPropsWithoutRef<"input">, "size"> & { icon: LucideIcon; rowClassName?: string }) {
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-3 rounded-xl border border-auth-foreground/15 bg-auth-background/40 px-3.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary",
        rowClassName
      )}
    >
      <Icon className="size-5 shrink-0 text-auth-foreground/55" aria-hidden="true" />
      <Input
        size="underline"
        {...inputProps}
        className="w-full min-w-0 flex-1 text-body-sm text-auth-foreground placeholder:text-auth-foreground/35"
      />
    </div>
  );
}
