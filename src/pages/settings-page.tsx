import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DesktopSettings } from "@/components/settings/desktop-settings";
import { FilterBar } from "@/components/media/filter-bar";
import { SectionHeader } from "@/components/media/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { usePreferences } from "@/features/preferences/use-preferences";
import { notificationService } from "@/features/desktop/notification-service";
import { COLOR_PRESETS, type AccentColor } from "@/shared/constants/colors";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import { cn } from "@/shared/lib/cn";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: preferences, updatePreference, isSaving, isError, error, refetch } = usePreferences();
  if (isError) {
    return <RemoteErrorState error={error} onRetry={() => void refetch()} />;
  }
  const setLanguage = async (language: "fr" | "en") => {
    await updatePreference({ key: "language", value: language });
    await i18n.changeLanguage(language);
  };
  const toggleNotifications = async () => {
    const enabled = !preferences?.notificationsEnabled;
    if (enabled && !(await notificationService.requestPermission())) return;
    await updatePreference({ key: "notificationsEnabled", value: enabled });
  };
  return (
    <div className="space-y-6">
      <SectionHeader title={t("nav.settings")} subtitle={t("settings.subtitleDesktop")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.uiPreferences")}</CardTitle>
            <CardDescription>{t("settings.customizeDisplay")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-medium">{t("settings.accentColor")}</p>
              <div className="flex flex-wrap gap-3">
                {(Object.entries(COLOR_PRESETS) as [AccentColor, (typeof COLOR_PRESETS)[AccentColor]][]).map(
                  ([key, preset]) => {
                    const selected = (preferences?.accentColor ?? "violet") === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={isSaving}
                        aria-pressed={selected}
                        aria-label={t(`colors.${key}`)}
                        onClick={() => void updatePreference({ key: "accentColor", value: key })}
                        className="flex flex-col items-center gap-1.5 disabled:opacity-50"
                      >
                        <div
                          className={cn(
                            "flex size-9 items-center justify-center rounded-full",
                            selected && "ring-2 ring-offset-2 ring-offset-background"
                          )}
                          style={{ backgroundColor: preset.swatch, ["--tw-ring-color" as string]: preset.swatch }}
                        >
                          {selected ? <Check className="size-4 text-white" /> : null}
                        </div>
                        <span className="text-caption text-muted-foreground">{t(`colors.${key}`)}</span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                {t("settings.language")}
                <Select
                  value={preferences?.language ?? "en"}
                  onChange={(event) => void setLanguage(event.target.value as "fr" | "en")}
                >
                  <option value="en">{t("settings.languageOptions.english")}</option>
                  <option value="fr">{t("settings.languageOptions.french")}</option>
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {t("settings.region")}
                <Select
                  value={preferences?.region ?? DEFAULT_TMDB_REGION}
                  onChange={(event) => void updatePreference({ key: "region", value: event.target.value })}
                >
                  <option value="FR">{t("settings.regionOptions.france")}</option>
                  <option value="BE">{t("settings.regionOptions.belgium")}</option>
                  <option value="CH">{t("settings.regionOptions.switzerland")}</option>
                  <option value="CA">{t("settings.regionOptions.canada")}</option>
                  <option value="GB">{t("settings.regionOptions.uk")}</option>
                  <option value="US">{t("settings.regionOptions.us")}</option>
                </Select>
              </label>
            </div>
            <div>
              <p className="mb-3 text-sm font-medium">{t("settings.defaultSearch")}</p>
              <FilterBar
                value={preferences?.defaultSearchType ?? "all"}
                onChange={(value) => void updatePreference({ key: "defaultSearchType", value })}
                options={[
                  { value: "all", label: t("settings.all") },
                  { value: "series", label: t("settings.series") },
                  { value: "movie", label: t("settings.movies") },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={preferences?.reduceMotion ? "secondary" : "outline"}
                aria-pressed={preferences?.reduceMotion ?? false}
                onClick={() => void updatePreference({ key: "reduceMotion", value: !preferences?.reduceMotion })}
              >
                {t("settings.reduceAnimations")}
              </Button>
              <Button
                variant={preferences?.compactMode ? "secondary" : "outline"}
                aria-pressed={preferences?.compactMode ?? false}
                onClick={() => void updatePreference({ key: "compactMode", value: !preferences?.compactMode })}
              >
                {t("settings.compactMode")}
              </Button>
              <Button
                variant={preferences?.spoilerProtection ? "secondary" : "outline"}
                aria-pressed={preferences?.spoilerProtection ?? false}
                onClick={() =>
                  void updatePreference({ key: "spoilerProtection", value: !preferences?.spoilerProtection })
                }
              >
                {t("settings.spoilerProtection")}
              </Button>
              <Button
                variant={preferences?.notificationsEnabled ? "secondary" : "outline"}
                aria-pressed={preferences?.notificationsEnabled ?? false}
                onClick={() => void toggleNotifications()}
              >
                {t("settings.calendarNotifications")}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.desktopSecurity")}</CardTitle>
            <CardDescription>{t("settings.desktopSecurityDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DesktopSettings />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
