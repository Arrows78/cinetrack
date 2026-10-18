import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { AboutSettings } from "@/components/settings/about-settings";
import { AccountSettingsCard } from "@/components/settings/account-settings-card";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { BackupTools } from "@/components/settings/backup-tools";
import { HiddenTitlesCard } from "@/components/settings/hidden-titles-card";
import { DesktopSettings } from "@/components/settings/desktop-settings";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { ProfilesCard } from "@/components/settings/profiles-card";
import { SyncStatusCard } from "@/components/settings/sync-status-card";
import { TvTimeImportCard } from "@/components/settings/tvtime-import-card";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SettingToggle } from "@/components/ui/setting-toggle";
import { SectionNav } from "@/components/ui/section-nav";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { defaultPreferences } from "@/shared/constants/preferences-schema";
import { usePreferences } from "@/features/preferences/use-preferences";
import { PLATFORMS } from "@/shared/constants/discover";
import type { UserPreferences } from "@/types/media";

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
  const { t } = useTranslation();
  const { data: preferences, updatePreference, isSaving, isError, error, refetch } = usePreferences();
  if (isError) {
    return <RemoteErrorState error={error} onRetry={() => void refetch()} />;
  }
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
        <AppearanceCard preferences={preferences} updatePreference={updatePreference} isSaving={isSaving} />
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
            intervalHours={
              preferences?.availabilityCheckIntervalHours ?? defaultPreferences.availabilityCheckIntervalHours
            }
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
        <NotificationsCard preferences={preferences} updatePreference={updatePreference} isSaving={isSaving} />
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
