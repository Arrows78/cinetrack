import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Check, Lock, Pencil, Settings, Trash2, UserPlus } from "lucide-react";
import { AboutSettings } from "@/components/settings/about-settings";
import { AccountSettingsCard } from "@/components/settings/account-settings-card";
import { AvatarPicker } from "@/components/ui/avatar-picker";
import { BackupTools } from "@/components/settings/backup-tools";
import { HiddenTitlesCard } from "@/components/settings/hidden-titles-card";
import { DesktopSettings } from "@/components/settings/desktop-settings";
import { PinPromptDialog } from "@/components/settings/pin-prompt-dialog";
import { SyncStatusCard } from "@/components/settings/sync-status-card";
import { TvTimeImportCard } from "@/components/settings/tvtime-import-card";
import { FilterBar } from "@/components/media/library/filter-bar";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Select } from "@/components/ui/select";
import { SettingToggle } from "@/components/ui/setting-toggle";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { SectionNav } from "@/components/ui/section-nav";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { authConfig } from "@/features/auth";
import { useAuth } from "@/features/auth/use-auth";
import { notificationService } from "@/features/desktop";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useProfiles, useProfileSwitching } from "@/features/profiles/use-profiles";
import { COLOR_PRESETS, type AccentColor, type AvatarPresetKey } from "@/shared/constants/colors";
import { DEFAULT_LANGUAGE, DEFAULT_TMDB_REGION, PLATFORMS } from "@/shared/constants/discover";
import { cn } from "@/shared/lib/cn";
import type { UserPreferences, UserProfile } from "@/types/media";

// Every one of these sections always renders (none depend on async data
// that could leave it empty), unlike home-page.tsx's own SectionNav — so the
// item list here is static, no usePresentSectionIds filtering needed.
const SETTINGS_UI_ID = "settings-ui-preferences";
const SETTINGS_STREAMING_ID = "settings-streaming";
const SETTINGS_NOTIFICATIONS_ID = "settings-notifications";
const SETTINGS_ACCOUNT_ID = "settings-account";
const SETTINGS_DATA_ID = "settings-data";
const SETTINGS_HIDDEN_TITLES_ID = "settings-hidden-titles";
const SETTINGS_DESKTOP_ID = "settings-desktop-security";
const SETTINGS_ABOUT_ID = "settings-about";

function ProfilesCard({ activeProfileId }: { activeProfileId: string | undefined }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const profiles = useProfiles();
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAvatar, setNewProfileAvatar] = useState<AvatarPresetKey | null>(null);
  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<UserProfile | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<AvatarPresetKey | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinPromptProfile, setPinPromptProfile] = useState<UserProfile | null>(null);
  // See useProfileSwitching's own doc comment for why a free switcher here
  // is safe (and only ever offered when auth isn't required — the read-only
  // branch below).
  const { switchingProfileId, switchToProfile } = useProfileSwitching();

  // Only offered in the offline free-switcher branch below — the signed-in
  // branch never shows a switcher at all (access is already gated by who's
  // signed in), so a PIN there would protect nothing.
  const requestSwitch = (profile: UserProfile) => {
    if (profile.hasPin) {
      setPinPromptProfile(profile);
      return;
    }
    void switchToProfile(profile.id);
  };

  const savePin = async (id: string) => {
    if (pinDraft.length < 4) return;
    try {
      await profiles.setPin({ id, pin: pinDraft });
      setPinDraft("");
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts).
    }
  };
  const removePin = async (id: string) => {
    try {
      await profiles.clearPin(id);
      setPinDraft("");
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts).
    }
  };

  const currentProfile = profiles.data?.find((profile) => profile.id === activeProfileId);

  const createProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    try {
      await profiles.create({ name, avatar: newProfileAvatar });
      setNewProfileName("");
      setNewProfileAvatar(null);
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts).
    }
  };

  // The "default" profile always displays a fixed, translated name (see
  // both render branches below) regardless of what's stored — renaming it
  // would change data that never visibly shows, so its edit control is
  // disabled, same as its delete button already is.
  const startEdit = (profile: UserProfile) => {
    setEditingProfileId(profile.id);
    setEditName(profile.name ?? "");
    setEditAvatar((profile.avatar as AvatarPresetKey | null) ?? null);
    setPinDraft("");
  };
  const cancelEdit = () => {
    setEditingProfileId(null);
    setPinDraft("");
  };
  const saveEdit = async () => {
    const name = editName.trim();
    const id = editingProfileId;
    if (!id || !name) return;
    try {
      await profiles.update({ id, name, avatar: editAvatar });
      setEditingProfileId(null);
    } catch {
      // Failure toast is handled by the app-wide MutationCache error
      // handler (see query-client.ts) — the inline form stays open so the
      // user can retry.
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
            editingProfileId === currentProfile.id ? (
              <Tile className="space-y-3 px-3 py-3">
                <Input
                  size="sm"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  aria-label={t("settings.profiles.editNameLabel")}
                  maxLength={60}
                />
                <p className="text-caption text-muted-foreground">{t("profileGate.avatarLabel")}</p>
                <AvatarPicker value={editAvatar} onChange={setEditAvatar} disabled={profiles.isSaving} />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    isLoading={profiles.isSaving}
                    disabled={!editName.trim() || profiles.isSaving}
                    onClick={() => void saveEdit()}
                  >
                    {t("settings.profiles.save")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={profiles.isSaving} onClick={cancelEdit}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </Tile>
            ) : (
              <Tile className="flex items-center gap-3 px-3 py-3">
                <ProfileAvatar
                  name={
                    currentProfile.id === "default" ? t("settings.profiles.defaultName") : (currentProfile.name ?? "?")
                  }
                  avatar={currentProfile.avatar}
                  className="size-9"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {currentProfile.id === "default" ? t("settings.profiles.defaultName") : currentProfile.name}
                  </p>
                  {user?.primaryEmailAddress?.emailAddress ? (
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      {t("settings.profiles.linkedTo", { email: user.primaryEmailAddress.emailAddress })}
                    </p>
                  ) : null}
                </div>
                {currentProfile.id !== "default" ? (
                  <IconTooltip label={t("settings.profiles.edit", { name: currentProfile.name })}>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("settings.profiles.edit", { name: currentProfile.name })}
                      onClick={() => startEdit(currentProfile)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </IconTooltip>
                ) : null}
              </Tile>
            )
          ) : (
            <p className="text-body-sm text-muted-foreground">{t("settings.profiles.none")}</p>
          )
        ) : (
          // No account is in play at all offline — set_active_profile
          // (src-tauri/src/preferences/) only ever rejects a switch
          // into a profile that's linked to one, so free switching between
          // these local-only profiles is safe.
          <div className="space-y-3">
            {(profiles.data ?? []).map((profile) => {
              const isActive = profile.id === activeProfileId;
              const label = profile.id === "default" ? t("settings.profiles.defaultName") : profile.name;
              if (editingProfileId === profile.id) {
                return (
                  <Tile key={profile.id} className="space-y-3 px-3 py-2.5">
                    <Input
                      size="sm"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      aria-label={t("settings.profiles.editNameLabel")}
                      maxLength={60}
                    />
                    <p className="text-caption text-muted-foreground">{t("profileGate.avatarLabel")}</p>
                    <AvatarPicker value={editAvatar} onChange={setEditAvatar} disabled={profiles.isSaving} />
                    <div>
                      <p className="mb-2 text-caption text-muted-foreground">{t("settings.profiles.pin.label")}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          size="sm"
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          className="w-28"
                          value={pinDraft}
                          onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          aria-label={t("settings.profiles.pin.inputLabel")}
                          maxLength={6}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pinDraft.length < 4 || profiles.isSaving}
                          isLoading={profiles.isSaving}
                          onClick={() => void savePin(profile.id)}
                        >
                          {profile.hasPin
                            ? t("settings.profiles.pin.changeLabel")
                            : t("settings.profiles.pin.setLabel")}
                        </Button>
                        {profile.hasPin ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={profiles.isSaving}
                            onClick={() => void removePin(profile.id)}
                          >
                            {t("settings.profiles.pin.removeLabel")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        isLoading={profiles.isSaving}
                        disabled={!editName.trim() || profiles.isSaving}
                        onClick={() => void saveEdit()}
                      >
                        {t("settings.profiles.save")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={profiles.isSaving} onClick={cancelEdit}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </Tile>
                );
              }
              return (
                <Tile key={profile.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-body-sm font-medium disabled:cursor-default"
                    disabled={isActive || switchingProfileId !== null}
                    onClick={() => requestSwitch(profile)}
                  >
                    <ProfileAvatar name={label ?? "?"} avatar={profile.avatar} className="size-7 text-caption" />
                    <span className="truncate">{label}</span>
                    {profile.hasPin ? (
                      <Lock
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label={t("settings.profiles.pin.locked")}
                      />
                    ) : null}
                    {isActive ? (
                      <Badge variant="success" className="gap-1">
                        <Check className="size-3" aria-hidden="true" />
                        {t("settings.profiles.active")}
                      </Badge>
                    ) : null}
                  </button>
                  {profile.id !== "default" ? (
                    <IconTooltip label={t("settings.profiles.edit", { name: label })}>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t("settings.profiles.edit", { name: label })}
                        disabled={switchingProfileId !== null}
                        onClick={() => startEdit(profile)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </IconTooltip>
                  ) : null}
                  <IconTooltip
                    label={
                      profile.id === "default"
                        ? t("settings.profiles.defaultCannotDelete")
                        : t("settings.profiles.delete", { name: label })
                    }
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={
                        profile.id === "default"
                          ? t("settings.profiles.defaultCannotDelete")
                          : t("settings.profiles.delete", { name: label })
                      }
                      disabled={profile.id === "default" || switchingProfileId !== null}
                      onClick={() => setPendingDeleteProfile(profile)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </IconTooltip>
                </Tile>
              );
            })}
            <div className="space-y-3">
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
                  isLoading={profiles.isSaving}
                  disabled={!newProfileName.trim() || profiles.isSaving}
                  onClick={() => void createProfile()}
                >
                  <UserPlus className="mr-2 size-4" />
                  {t("settings.profiles.create")}
                </Button>
              </div>
              <div>
                <p className="mb-2 text-caption text-muted-foreground">{t("profileGate.avatarLabel")}</p>
                <AvatarPicker value={newProfileAvatar} onChange={setNewProfileAvatar} disabled={profiles.isSaving} />
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDeleteProfile !== null}
        onOpenChange={(open) => !open && !profiles.isSaving && setPendingDeleteProfile(null)}
        title={t("settings.profiles.deleteConfirmTitle", {
          name:
            pendingDeleteProfile?.id === "default" ? t("settings.profiles.defaultName") : pendingDeleteProfile?.name,
        })}
        description={t("settings.profiles.deleteConfirmDescription")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        isConfirming={profiles.isSaving}
        onConfirm={() => {
          if (!pendingDeleteProfile) return;
          const target = pendingDeleteProfile;
          // Failure toast is handled by the app-wide MutationCache error
          // handler (see query-client.ts) — the dialog stays open (and
          // isConfirming clears) so the user can retry instead of losing
          // their place; the catch here only prevents an unhandled
          // rejection, it doesn't need to do anything itself.
          void profiles
            .remove(target.id)
            .then(() => setPendingDeleteProfile(null))
            .catch(() => {});
        }}
      />

      <PinPromptDialog
        open={pinPromptProfile !== null}
        profileName={
          pinPromptProfile?.id === "default" ? t("settings.profiles.defaultName") : (pinPromptProfile?.name ?? "")
        }
        onOpenChange={(open) => !open && setPinPromptProfile(null)}
        onVerify={(pin) => profiles.verifyPin(pinPromptProfile!.id, pin)}
        onSuccess={() => {
          const target = pinPromptProfile;
          setPinPromptProfile(null);
          if (target) void switchToProfile(target.id);
        }}
      />
    </Card>
  );
}

// Platform brand names (PLATFORMS' `label`) are proper nouns rendered as-is
// elsewhere in the app (see the platform <Select> on WatchTonightPage) — not
// run through t(), same as accentColor's own preset names are.
function StreamingServicesCard({
  providerIds,
  onToggle,
  isSaving,
}: {
  providerIds: number[];
  onToggle: (providerId: number) => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.streaming.title")}</CardTitle>
        <CardDescription>{t("settings.streaming.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {PLATFORMS.map((platform) => (
          <SettingToggle
            key={platform.id}
            label={platform.label}
            pressed={providerIds.includes(platform.id)}
            disabled={isSaving}
            onPressedChange={() => onToggle(platform.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// Whole-hour presets only (matches availabilityCheckIntervalHours' own 1-24
// validation range) — an arbitrary free-text number field would need its own
// input validation UI for very little gain over a handful of sane presets.
const AVAILABILITY_CHECK_INTERVAL_OPTIONS = [1, 3, 6, 12, 24] as const;

function AvailabilityCheckCard({
  intervalHours,
  onChange,
  isSaving,
}: {
  intervalHours: number;
  onChange: (hours: number) => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.availabilityChecks.title")}</CardTitle>
        <CardDescription>{t("settings.availabilityChecks.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="grid gap-2 text-body-sm font-medium">
          {t("settings.availabilityChecks.frequency")}
          <Select value={intervalHours} disabled={isSaving} onChange={(event) => onChange(Number(event.target.value))}>
            {AVAILABILITY_CHECK_INTERVAL_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                {t("settings.availabilityChecks.frequencyOption", { count: hours })}
              </option>
            ))}
          </Select>
        </label>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/availability-alerts">{t("settings.availabilityChecks.manageAlerts")}</Link>
        </Button>
      </CardContent>
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
  const toggleCalendarNotifications = async () => {
    await updatePreference({ key: "notificationsEnabled", value: !preferences?.notificationsEnabled });
  };
  const toggleAvailabilityAlerts = async () => {
    await updatePreference({ key: "availabilityAlertsEnabled", value: !preferences?.availabilityAlertsEnabled });
  };
  // The only one of the three that actually needs the OS permission prompt
  // — calendar reminders and availability alerts can both be "on" and stay
  // silent (no desktop toast) if this one is off, per notifyDue's and
  // availabilityMonitor.checkAll's own desktopNotificationsEnabled gating.
  const toggleDesktopNotifications = async () => {
    const enabled = !preferences?.desktopNotificationsEnabled;
    if (enabled && !(await notificationService.requestPermission())) return;
    await updatePreference({ key: "desktopNotificationsEnabled", value: enabled });
  };
  const toggleStreamingProvider = async (providerId: number) => {
    const current = preferences?.preferredProviderIds ?? [];
    const next: UserPreferences["preferredProviderIds"] = current.includes(providerId)
      ? current.filter((id) => id !== providerId)
      : [...current, providerId];
    await updatePreference({ key: "preferredProviderIds", value: next });
  };
  const navItems = [
    { id: SETTINGS_UI_ID, label: t("settings.uiPreferences") },
    { id: SETTINGS_STREAMING_ID, label: t("settings.sections.streaming") },
    { id: SETTINGS_NOTIFICATIONS_ID, label: t("settings.sections.notifications") },
    { id: SETTINGS_ACCOUNT_ID, label: t("settings.sections.account") },
    { id: SETTINGS_DATA_ID, label: t("settings.sections.data") },
    { id: SETTINGS_HIDDEN_TITLES_ID, label: t("recommendations.hiddenTitles.title") },
    { id: SETTINGS_DESKTOP_ID, label: t("settings.desktopSecurity") },
    { id: SETTINGS_ABOUT_ID, label: t("settings.sections.about") },
  ];
  return (
    <div className="space-y-8">
      <SectionHeader title={t("nav.settings")} subtitle={t("settings.subtitleDesktop")} icon={Settings} isPageTitle />
      <SectionNav items={navItems} ariaLabel={t("settings.navSectionsLabel")} />

      <section id={SETTINGS_UI_ID} className="scroll-mt-28">
        <SectionHeader
          size="sub"
          headingLevel={2}
          title={t("settings.uiPreferences")}
          subtitle={t("settings.customizeDisplay")}
        />
        <Card>
          <CardContent className="mt-0 space-y-6">
            <div>
              <p className="mb-3 text-body-sm font-medium">{t("settings.accentColor")}</p>
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
                  value={preferences?.language ?? DEFAULT_LANGUAGE}
                  onChange={(event) => void setLanguage(event.target.value as "fr" | "en")}
                >
                  <option value="en">{t("settings.languageOptions.english")}</option>
                  <option value="fr">{t("settings.languageOptions.french")}</option>
                </Select>
              </label>
              <label className="grid gap-2 text-body-sm font-medium">
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
              {/* The visible label doubles as FilterBar's accessible group
                  name (groupLabel) instead of a plain <p> with no
                  programmatic association to the control below it. */}
              <p className="mb-3 text-body-sm font-medium">{t("settings.defaultSearch")}</p>
              <FilterBar
                value={preferences?.defaultSearchType ?? "all"}
                onChange={(value) => void updatePreference({ key: "defaultSearchType", value })}
                groupLabel={t("settings.defaultSearch")}
                options={[
                  { value: "all", label: t("filters.all") },
                  { value: "series", label: t("filters.typeSeries") },
                  { value: "movie", label: t("filters.typeMovies") },
                  { value: "person", label: t("filters.typePeople") },
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
                label={t("settings.onThisDay")}
                pressed={preferences?.onThisDayEnabled ?? false}
                onPressedChange={() =>
                  void updatePreference({ key: "onThisDayEnabled", value: !preferences?.onThisDayEnabled })
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section id={SETTINGS_STREAMING_ID} className="scroll-mt-28">
        <SectionHeader
          size="sub"
          headingLevel={2}
          title={t("settings.sections.streaming")}
          subtitle={t("settings.sections.streamingDesc")}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <StreamingServicesCard
            providerIds={preferences?.preferredProviderIds ?? []}
            onToggle={(providerId) => void toggleStreamingProvider(providerId)}
            isSaving={isSaving}
          />
          <AvailabilityCheckCard
            intervalHours={preferences?.availabilityCheckIntervalHours ?? 6}
            onChange={(hours) => void updatePreference({ key: "availabilityCheckIntervalHours", value: hours })}
            isSaving={isSaving}
          />
        </div>
      </section>

      <section id={SETTINGS_NOTIFICATIONS_ID} className="scroll-mt-28">
        <SectionHeader
          size="sub"
          headingLevel={2}
          title={t("settings.sections.notifications")}
          subtitle={t("settings.sections.notificationsDesc")}
        />
        <Card>
          <CardContent className="mt-0 flex flex-wrap gap-2">
            <SettingToggle
              label={t("settings.calendarNotifications")}
              pressed={preferences?.notificationsEnabled ?? false}
              onPressedChange={() => void toggleCalendarNotifications()}
            />
            <SettingToggle
              label={t("settings.availabilityAlerts")}
              pressed={preferences?.availabilityAlertsEnabled ?? false}
              onPressedChange={() => void toggleAvailabilityAlerts()}
            />
            <SettingToggle
              label={t("settings.desktopNotifications")}
              pressed={preferences?.desktopNotificationsEnabled ?? false}
              onPressedChange={() => void toggleDesktopNotifications()}
            />
          </CardContent>
        </Card>
      </section>

      <section id={SETTINGS_ACCOUNT_ID} className="scroll-mt-28">
        <SectionHeader
          size="sub"
          headingLevel={2}
          title={t("settings.sections.account")}
          subtitle={t("settings.sections.accountDesc")}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <ProfilesCard activeProfileId={preferences?.activeProfileId} />
          <SyncStatusCard />
          <AccountSettingsCard />
        </div>
      </section>

      <section id={SETTINGS_DATA_ID} className="scroll-mt-28">
        <SectionHeader
          size="sub"
          headingLevel={2}
          title={t("settings.sections.data")}
          subtitle={t("settings.sections.dataDesc")}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <BackupTools />
          <TvTimeImportCard />
        </div>
      </section>

      <section id={SETTINGS_HIDDEN_TITLES_ID} className="scroll-mt-28">
        <SectionHeader size="sub" headingLevel={2} title={t("recommendations.hiddenTitles.title")} />
        <HiddenTitlesCard />
      </section>

      <section id={SETTINGS_DESKTOP_ID} className="scroll-mt-28">
        <SectionHeader
          size="sub"
          headingLevel={2}
          title={t("settings.desktopSecurity")}
          subtitle={t("settings.desktopSecurityDesc")}
        />
        <DesktopSettings />
      </section>

      <section id={SETTINGS_ABOUT_ID} className="scroll-mt-28">
        <SectionHeader
          size="sub"
          headingLevel={2}
          title={t("settings.sections.about")}
          subtitle={t("settings.sections.aboutDesc")}
        />
        <AboutSettings />
      </section>
    </div>
  );
}
