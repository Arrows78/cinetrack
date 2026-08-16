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
      {/* Fixed white, not text-primary-foreground: that token is tuned for
          AA contrast against a solid primary fill and goes near-black in
          dark theme — wrong here since the badge is a primary→accent
          gradient (light violet to dark teal), and the OS app icon (see
          src-tauri/icons/icon.svg) already draws this same glyph in white. */}
      <Clapperboard className="h-1/2 w-1/2 text-white" aria-hidden="true" />
    </div>
  );
}
