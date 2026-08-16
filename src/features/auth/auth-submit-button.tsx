import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";

// The one primary pill CTA shape across the auth flow (send code, verify,
// create profile) — was copy-pasted identically in three files.
export function AuthSubmitButton({
  disabled,
  loading,
  className,
  children,
}: {
  disabled: boolean;
  loading: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cn(
        "flex h-14 w-full items-center justify-center rounded-full bg-primary text-base font-black uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60",
        className
      )}
    >
      {loading ? <LoaderCircle className="h-6 w-6 animate-spin" /> : children}
    </button>
  );
}
