import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { FilterBar } from "@/components/media/library/filter-bar";
import type { PreferenceCardProps } from "@/components/settings/settings-card-props";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SettingToggle } from "@/components/ui/setting-toggle";
import { COLOR_PRESETS, type AccentColor } from "@/shared/constants/colors";
import { defaultPreferences } from "@/shared/constants/preferences-schema";
import { cn } from "@/shared/lib/cn";

type UiToggle = {
  key: "reduceMotion" | "compactMode" | "spoilerProtection" | "onThisDayEnabled";
  labelKey: string;
};

const UI_TOGGLES: UiToggle[] = [
  { key: "reduceMotion", labelKey: "settings.reduceAnimations" },
  { key: "compactMode", labelKey: "settings.compactMode" },
  { key: "spoilerProtection", labelKey: "settings.spoilerProtection" },
  { key: "onThisDayEnabled", labelKey: "settings.onThisDay" },
];

/** Accent color, language, region, default search type and display toggles. */
export function AppearanceCard({ preferences, updatePreference, setPreference, isSaving }: PreferenceCardProps) {
  const { t, i18n } = useTranslation();
  const setLanguage = async (language: "fr" | "en") => {
    await updatePreference({ key: "language", value: language });
    await i18n.changeLanguage(language);
  };
  return (
    <Card>
      <CardContent className="mt-0 space-y-6">
        <div>
          <p className="mb-3 text-body-sm font-medium">{t("settings.accentColor")}</p>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(COLOR_PRESETS) as [AccentColor, (typeof COLOR_PRESETS)[AccentColor]][]).map(
              ([key, preset]) => {
                const selected = (preferences?.accentColor ?? defaultPreferences.accentColor) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isSaving}
                    aria-pressed={selected}
                    aria-label={t(`colors.${key}`)}
                    onClick={() => setPreference({ key: "accentColor", value: key })}
                    className="flex flex-col items-center gap-1.5 disabled:opacity-50"
                  >
                    <div
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full",
                        selected && "ring-2 ring-offset-2 ring-offset-background"
                      )}
                      style={{ backgroundColor: preset.swatch, ["--tw-ring-color" as string]: preset.swatch }}
                    >
                      {/* Fixed white, not a theme token: this sits on the preset's own
                              arbitrary swatch color (backgroundColor above), which can be
                              any hue — a semantic foreground token isn't contrast-tested
                              against it. Same reasoning as MEDIA_POSTER_OVERLAY_CLASSNAME's
                              own documented fixed white. */}
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
          <label className="grid gap-2 text-body-sm font-medium">
            {t("settings.language")}
            <Select
              value={preferences?.language ?? defaultPreferences.language}
              disabled={isSaving}
              onChange={(event) => void setLanguage(event.target.value as "fr" | "en")}
            >
              <option value="en">{t("settings.languageOptions.english")}</option>
              <option value="fr">{t("settings.languageOptions.french")}</option>
            </Select>
          </label>
          <label className="grid gap-2 text-body-sm font-medium">
            {t("settings.region")}
            <Select
              value={preferences?.region ?? defaultPreferences.region}
              disabled={isSaving}
              onChange={(event) => setPreference({ key: "region", value: event.target.value })}
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
          {/* The visible label doubles as FilterBar's accessible group
                  name (groupLabel) instead of a plain <p> with no
                  programmatic association to the control below it. */}
          <p className="mb-3 text-body-sm font-medium">{t("settings.defaultSearch")}</p>
          <FilterBar
            value={preferences?.defaultSearchType ?? defaultPreferences.defaultSearchType}
            onChange={(value) => setPreference({ key: "defaultSearchType", value })}
            groupLabel={t("settings.defaultSearch")}
            disabled={isSaving}
            options={[
              { value: "all", label: t("filters.all") },
              { value: "series", label: t("filters.typeSeries") },
              { value: "movie", label: t("filters.typeMovies") },
              { value: "person", label: t("filters.typePeople") },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {UI_TOGGLES.map(({ key, labelKey }) => (
            <SettingToggle
              key={key}
              label={t(labelKey)}
              pressed={preferences?.[key] ?? defaultPreferences[key]}
              disabled={isSaving}
              onPressedChange={() => setPreference({ key, value: !preferences?.[key] })}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
