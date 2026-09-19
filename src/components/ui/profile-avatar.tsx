import { AVATAR_PRESETS, type AvatarPresetKey } from "@/shared/constants/colors";
import { cn } from "@/shared/lib/cn";

function isAvatarPresetKey(value: string): value is AvatarPresetKey {
  return value in AVATAR_PRESETS;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

/**
 * Shared profile identity glyph: the picked avatar preset (see
 * create-profile-screen.tsx) when one is set, falling back to the profile's
 * first initial otherwise — the only rendering local profiles had before the
 * avatar picker existed. Callers size it via `className` (e.g. `size-6`,
 * `size-9`); this component only owns the fill/glyph, not the dimensions.
 */
export function ProfileAvatar({
  name,
  avatar,
  className,
}: {
  name: string;
  avatar?: string | null;
  className?: string;
}) {
  const preset = avatar && isAvatarPresetKey(avatar) ? AVATAR_PRESETS[avatar] : null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        !preset && "bg-primary/20 text-primary",
        className
      )}
      style={preset ? { backgroundColor: preset.swatch } : undefined}
    >
      {preset ? preset.emoji : initialOf(name)}
    </span>
  );
}
