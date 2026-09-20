import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { AVATAR_PRESETS, type AvatarPresetKey } from "@/shared/constants/colors";
import { cn } from "@/shared/lib/cn";

/**
 * The same emoji+swatch picker create-profile-screen.tsx (the cloud
 * sign-in flow) already offers, restyled for the app's own surface tokens
 * instead of that screen's auth-only theme — so local profiles (create or
 * edit) get the identical set of choices, not a second bespoke picker.
 */
export function AvatarPicker({
  value,
  onChange,
  disabled,
}: {
  value: AvatarPresetKey | null;
  onChange: (next: AvatarPresetKey | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-3">
      {(Object.entries(AVATAR_PRESETS) as [AvatarPresetKey, (typeof AVATAR_PRESETS)[AvatarPresetKey]][]).map(
        ([key, preset]) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={t(`avatars.${key}`)}
              onClick={() => onChange(selected ? null : key)}
              className="relative flex size-9 items-center justify-center rounded-full text-lg disabled:opacity-50"
            >
              <span
                className={cn(
                  "flex size-full items-center justify-center rounded-full",
                  selected && "ring-2 ring-offset-2 ring-offset-background"
                )}
                style={{ backgroundColor: preset.swatch, ["--tw-ring-color" as string]: preset.swatch }}
              >
                <span aria-hidden="true">{preset.emoji}</span>
              </span>
              {selected ? (
                <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="size-2.5" aria-hidden="true" />
                </span>
              ) : null}
            </button>
          );
        }
      )}
    </div>
  );
}
