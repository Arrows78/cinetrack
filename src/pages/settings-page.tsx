import { useTranslation } from "react-i18next";
import { Check, ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/media/filter-bar";
import { SectionHeader } from "@/components/media/section-header";
import { usePreferences } from "@/hooks/use-local-media";
import { COLOR_PRESETS } from "@/shared/constants/colors";
import type { AccentColor } from "@/shared/constants/colors";

export function SettingsPage() {
  const { t } = useTranslation();
  const { data: preferences, updatePreference, isSaving } = usePreferences();

  return (
    <div className="space-y-6">
      <SectionHeader title={t("nav.settings")} subtitle={t("settings.subtitle")} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.uiPreferences")}</CardTitle>
            <CardDescription>{t("settings.uiPreferencesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-medium">{t("settings.accentColor")}</p>
              <div className="flex flex-wrap gap-3">
                {(Object.entries(COLOR_PRESETS) as [AccentColor, (typeof COLOR_PRESETS)[AccentColor]][]).map(
                  ([key, preset]) => {
                    const isSelected = (preferences?.accentColor ?? "violet") === key;
                    return (
                      <button
                        key={key}
                        disabled={isSaving}
                        onClick={() => updatePreference({ key: "accentColor", value: key })}
                        className="flex flex-col items-center gap-1.5 disabled:opacity-50"
                      >
                        <div
                          className={cn(
                            "relative flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            isSelected && "ring-2 ring-offset-2 ring-offset-background"
                          )}
                          style={{
                            backgroundColor: preset.swatch,
                            // ring color matches the swatch
                            ["--tw-ring-color" as string]: preset.swatch,
                          }}
                        >
                          {isSelected && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                        </div>
                        <span className={cn("text-[10px] font-medium", isSelected ? "text-primary" : "text-muted-foreground")}>
                          {preset.label}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">{t("settings.defaultSearchType")}</p>
              <FilterBar
                value={preferences?.defaultSearchType ?? "all"}
                onChange={(value) => updatePreference({ key: "defaultSearchType", value })}
                options={[
                  { value: "all", label: t("settings.all") },
                  { value: "series", label: t("nav.series") },
                  { value: "movie", label: t("nav.movies") },
                ]}
              />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">{t("settings.defaultWatchlistFilter")}</p>
              <FilterBar
                value={preferences?.defaultWatchlistFilter ?? "all"}
                onChange={(value) => updatePreference({ key: "defaultWatchlistFilter", value })}
                options={[
                  { value: "all", label: t("settings.all") },
                  { value: "series", label: t("nav.series") },
                  { value: "movie", label: t("nav.movies") },
                ]}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant={preferences?.reduceMotion ? "secondary" : "outline"}
                disabled={isSaving}
                onClick={() => updatePreference({ key: "reduceMotion", value: !preferences?.reduceMotion })}
              >
                {preferences?.reduceMotion ? t("settings.reducedAnimationsOn") : t("settings.reduceAnimations")}
              </Button>
              <Button
                variant={preferences?.compactMode ? "secondary" : "outline"}
                disabled={isSaving}
                onClick={() => updatePreference({ key: "compactMode", value: !preferences?.compactMode })}
              >
                {preferences?.compactMode ? t("settings.compactModeOn") : t("settings.enableCompactMode")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.apiConfig")}</CardTitle>
            <CardDescription>{t("settings.apiConfigDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              {t("settings.envInstruction")} <code className="rounded bg-muted px-2 py-1">.env</code> :
            </p>
            <pre className="overflow-x-auto rounded-3xl border border-border bg-muted/50 p-4 text-xs text-foreground">
              VITE_TMDB_API_TOKEN=your_tmdb_bearer_token_here
            </pre>
            <Button asChild variant="outline">
              <a href="https://developer.themoviedb.org/docs/getting-started" target="_blank" rel="noreferrer">
                {t("settings.openTmdbDocs")}
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
