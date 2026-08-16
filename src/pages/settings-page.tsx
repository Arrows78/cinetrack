import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, UserPlus } from "lucide-react";
import { BackupTools } from "@/components/settings/backup-tools";
import { DesktopSettings } from "@/components/settings/desktop-settings";
import { TvTimeImportCard } from "@/components/settings/tvtime-import-card";
import { FilterBar } from "@/components/media/filter-bar";
import { SectionHeader } from "@/components/media/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SettingToggle } from "@/components/ui/setting-toggle";
import { Tile } from "@/components/ui/tile";
import { toast } from "@/components/ui/use-toast";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { authConfig } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { notificationService } from "@/features/desktop/notification-service";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useProfiles } from "@/features/profiles/use-profiles";
import { COLOR_PRESETS, type AccentColor } from "@/shared/constants/colors";
import { DEFAULT_LANGUAGE, DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import { cn } from "@/shared/lib/cn";
import type { UserProfile } from "@/types/media";

function ProfilesCard({ activeProfileId }: { activeProfileId: string | undefined }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profiles = useProfiles();
  const [newProfileName, setNewProfileName] = useState("");
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<UserProfile | null>(null);
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);

  const currentProfile = profiles.data?.find((profile) => profile.id === activeProfileId);

  // Only ever offered when auth isn't required (see the comment on the
  // read-only branch below for why a free switcher is otherwise a security
  // hole) — and set_active_profile itself refuses to switch into a profile
  // linked to a Supabase account without proof of that account, so this
  // can't be used to hop into somebody else's claimed profile even if auth
  // gets turned on later without this UI being hidden in time.
  const switchToProfile = async (profileId: string) => {
    setSwitchingProfileId(profileId);
    try {
      await preferencesRepository.setActiveProfile(profileId);
      queryClient.removeQueries({ queryKey: ["local"] });
    } catch {
      toast({ description: t("settings.profiles.switchFailed"), variant: "error" });
    } finally {
      setSwitchingProfileId(null);
    }
  };

  const createProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    try {
      await profiles.create(name);
      setNewProfileName("");
    } catch {
      toast({ description: t("settings.profiles.createFailed"), variant: "error" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.profiles.title")}</CardTitle>
        <CardDescription>{t("settings.profiles.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {profiles.isError ? (
          <RemoteErrorState error={profiles.error} onRetry={() => void profiles.refetch()} />
        ) : authConfig.required ? (
          // Access to a profile is derived from who is signed in (see
          // ProfileGate) — this used to be a free switcher letting anyone
          // click into any local profile, which would have let a signed-in
          // account read another account's data. Only the current profile
          // is shown here now, read-only, whenever sign-in is required.
          currentProfile ? (
            <Tile className="px-3 py-3">
              <p className="font-medium">
                {currentProfile.id === "default" ? t("settings.profiles.defaultName") : currentProfile.name}
              </p>
              {user?.email ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("settings.profiles.linkedTo", { email: user.email })}
                </p>
              ) : null}
            </Tile>
          ) : (
            <p className="text-sm text-muted-foreground">{t("settings.profiles.none")}</p>
          )
        ) : (
          // No Supabase account is in play at all offline — set_active_profile
          // (src-tauri/src/commands/preferences.rs) only ever rejects a switch
          // into a profile that's linked to one, so free switching between
          // these local-only profiles is safe.
          <div className="space-y-3">
            {(profiles.data ?? []).map((profile) => {
              const isActive = profile.id === activeProfileId;
              const label = profile.id === "default" ? t("settings.profiles.defaultName") : profile.name;
              return (
                <Tile key={profile.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium disabled:cursor-default"
                    disabled={isActive || switchingProfileId !== null}
                    onClick={() => void switchToProfile(profile.id)}
                  >
                    <span className="truncate">{label}</span>
                    {isActive ? (
                      <Badge variant="success" className="gap-1">
                        <Check className="size-3" aria-hidden="true" />
                        {t("settings.profiles.active")}
                      </Badge>
                    ) : null}
                  </button>
                  {profile.id !== "default" ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("settings.profiles.delete", { name: label })}
                      disabled={switchingProfileId !== null}
                      onClick={() => setPendingDeleteProfile(profile)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </Tile>
              );
            })}
            <div className="flex gap-2">
              <Input
                size="sm"
                value={newProfileName}
                onChange={(event) => setNewProfileName(event.target.value)}
                placeholder={t("settings.profiles.newNamePlaceholder")}
                aria-label={t("settings.profiles.newNameLabel")}
                maxLength={60}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!newProfileName.trim() || profiles.isSaving}
                onClick={() => void createProfile()}
              >
                <UserPlus className="mr-2 size-4" />
                {t("settings.profiles.create")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDeleteProfile !== null}
        onOpenChange={(open) => !open && setPendingDeleteProfile(null)}
        title={t("settings.profiles.deleteConfirmTitle", {
          name:
            pendingDeleteProfile?.id === "default" ? t("settings.profiles.defaultName") : pendingDeleteProfile?.name,
        })}
        description={t("settings.profiles.deleteConfirmDescription")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingDeleteProfile) return;
          const target = pendingDeleteProfile;
          setPendingDeleteProfile(null);
          void profiles.remove(target.id).catch(() => {
            toast({ description: t("settings.profiles.deleteFailed"), variant: "error" });
          });
        }}
      />
    </Card>
  );
}

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
                  value={preferences?.language ?? DEFAULT_LANGUAGE}
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
              <SettingToggle
                label={t("settings.reduceAnimations")}
                pressed={preferences?.reduceMotion ?? false}
                onPressedChange={() =>
                  void updatePreference({ key: "reduceMotion", value: !preferences?.reduceMotion })
                }
              />
              <SettingToggle
                label={t("settings.compactMode")}
                pressed={preferences?.compactMode ?? false}
                onPressedChange={() => void updatePreference({ key: "compactMode", value: !preferences?.compactMode })}
              />
              <SettingToggle
                label={t("settings.spoilerProtection")}
                pressed={preferences?.spoilerProtection ?? false}
                onPressedChange={() =>
                  void updatePreference({ key: "spoilerProtection", value: !preferences?.spoilerProtection })
                }
              />
              <SettingToggle
                label={t("settings.calendarNotifications")}
                pressed={preferences?.notificationsEnabled ?? false}
                onPressedChange={() => void toggleNotifications()}
              />
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
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfilesCard activeProfileId={preferences?.activeProfileId} />
        <BackupTools />
        <TvTimeImportCard />
      </div>
    </div>
  );
}
