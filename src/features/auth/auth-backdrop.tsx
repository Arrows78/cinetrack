import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { AUTH_BACKDROP_TILE_GRADIENTS, AUTH_BACKDROP_TILE_SHEEN } from "@/shared/constants/decorative-gradients";

const backdropTileKeys = [
  "auth.backdrop.midnight",
  "auth.backdrop.redHorizon",
  "auth.backdrop.theVoyage",
  "auth.backdrop.neonCity",
  "auth.backdrop.theArchive",
  "auth.backdrop.lastSignal",
  "auth.backdrop.wildNorth",
  "auth.backdrop.orbit",
  "auth.backdrop.afterglow",
  "auth.backdrop.dust",
  "auth.backdrop.blueRoom",
  "auth.backdrop.nocturne",
] as const;

export function AuthBackdrop() {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-1 overflow-hidden bg-black p-1 opacity-65 sm:grid-cols-4">
      {backdropTileKeys.map((key, index) => (
        <div
          key={key}
          className={cn(
            "relative min-h-36 overflow-hidden rounded-sm border border-white/5",
            index % 4 === 1 && "translate-y-8",
            index % 4 === 3 && "-translate-y-5"
          )}
          style={{ background: AUTH_BACKDROP_TILE_GRADIENTS[index] }}
        >
          <div className="absolute inset-0" style={{ background: AUTH_BACKDROP_TILE_SHEEN }} />
          <p className="absolute inset-x-2 bottom-3 text-center text-overline font-black text-auth-foreground/70">
            {t(key)}
          </p>
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/55 to-black" />
    </div>
  );
}
