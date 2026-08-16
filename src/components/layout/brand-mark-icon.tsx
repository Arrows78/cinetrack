import { Clapperboard } from "lucide-react";
import { cn } from "@/shared/lib/cn";

// The one visual identity for "CineTrack" as an icon — shared between the
// sidebar (collapsed/expanded) and the auth screens, so switching between
// signed-out and signed-in views doesn't switch brand marks along the way.
export function BrandMarkIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-glow",
        className
      )}
    >
      <Clapperboard className="h-1/2 w-1/2 text-primary-foreground" aria-hidden="true" />
    </div>
  );
}
