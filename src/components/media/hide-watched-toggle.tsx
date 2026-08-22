import { useTranslation } from "react-i18next";
import { SettingToggle } from "@/components/ui/setting-toggle";
import { usePreferences } from "@/features/preferences/use-preferences";

/**
 * Persistent "Hide watched" toggle for Discover-style surfaces (home
 * catalogue rails) and Watch Tonight — README's DISCOVERY roadmap item.
 * Backed by the `hideWatchedInDiscovery` preference (survives reload,
 * unlike plain component state) so reused as-is on both surfaces instead of
 * each page wiring its own copy of the same preference read/write.
 */
export function HideWatchedToggle() {
  const { t } = useTranslation();
  const { data: preferences, updatePreference, isSaving, isLoading } = usePreferences();
  const hideWatched = preferences?.hideWatchedInDiscovery ?? false;

  return (
    <SettingToggle
      label={t("discovery.hideWatched")}
      pressed={hideWatched}
      onPressedChange={() => void updatePreference({ key: "hideWatchedInDiscovery", value: !hideWatched })}
      disabled={isSaving || isLoading}
    />
  );
}
