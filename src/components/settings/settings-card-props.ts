import type { usePreferences } from "@/features/preferences/use-preferences";
import type { UserPreferences } from "@/types/media";

/** What the settings page hands each preference-driven card. */
export type PreferenceCardProps = {
  preferences: UserPreferences | undefined;
  updatePreference: ReturnType<typeof usePreferences>["updatePreference"];
  isSaving: boolean;
};
