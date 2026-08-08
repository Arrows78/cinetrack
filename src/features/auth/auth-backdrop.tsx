import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

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

const backdropGradients = [
  "linear-gradient(145deg, #161a28, #2c3658)",
  "linear-gradient(145deg, #3b1116, #8a272d)",
  "linear-gradient(145deg, #0f2430, #1d5a70)",
  "linear-gradient(145deg, #251147, #6d25a8)",
  "linear-gradient(145deg, #1e1e1e, #585858)",
  "linear-gradient(145deg, #3a220b, #9c661e)",
  "linear-gradient(145deg, #12261d, #34704f)",
  "linear-gradient(145deg, #101825, #314976)",
  "linear-gradient(145deg, #3c142f, #9e3d77)",
  "linear-gradient(145deg, #33291c, #8c7048)",
  "linear-gradient(145deg, #121f39, #315eab)",
  "linear-gradient(145deg, #17131d, #4d3b60)",
];

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
          style={{ background: backdropGradients[index] }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.2),transparent_45%)]" />
          <p className="absolute inset-x-2 bottom-3 text-center text-overline font-black text-white/70">{t(key)}</p>
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/55 to-black" />
    </div>
  );
}
