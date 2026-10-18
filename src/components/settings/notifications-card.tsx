import { useTranslation } from "react-i18next";
import type { PreferenceCardProps } from "@/components/settings/settings-card-props";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SettingToggle } from "@/components/ui/setting-toggle";
import { toast } from "@/components/ui/use-toast";
import { notificationService } from "@/features/desktop";
import { defaultPreferences } from "@/shared/constants/preferences-schema";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

/** Calendar reminders, availability alerts, desktop toasts and the reminder lead time. */
export function NotificationsCard({ preferences, updatePreference, isSaving }: PreferenceCardProps) {
  const { t } = useTranslation();
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
    if (enabled) {
      let granted: boolean;
      try {
        granted = await notificationService.requestPermission();
      } catch (error) {
        logger.warn(`Requesting the notification permission failed: ${errorMessage(error)}`);
        toast({ description: t("settings.notificationsToggleFailed"), variant: "error" });
        return;
      }
      if (!granted) {
        toast({ description: t("settings.notificationsPermissionDenied"), variant: "error" });
        return;
      }
    }
    await updatePreference({ key: "desktopNotificationsEnabled", value: enabled });
  };
  return (
    <Card>
      <CardContent className="mt-0 flex flex-wrap gap-2">
        <SettingToggle
          label={t("settings.calendarNotifications")}
          pressed={preferences?.notificationsEnabled ?? defaultPreferences.notificationsEnabled}
          disabled={isSaving}
          onPressedChange={() => void toggleCalendarNotifications()}
        />
        <SettingToggle
          label={t("settings.availabilityAlerts")}
          pressed={preferences?.availabilityAlertsEnabled ?? defaultPreferences.availabilityAlertsEnabled}
          disabled={isSaving}
          onPressedChange={() => void toggleAvailabilityAlerts()}
        />
        <SettingToggle
          label={t("settings.desktopNotifications")}
          pressed={preferences?.desktopNotificationsEnabled ?? defaultPreferences.desktopNotificationsEnabled}
          disabled={isSaving}
          onPressedChange={() => void toggleDesktopNotifications()}
        />
      </CardContent>
      <CardContent className="mt-4">
        <label className="grid gap-2 text-body-sm">
          <span className="font-medium">{t("settings.reminderLeadTime")}</span>
          <Select
            value={preferences?.notifyHoursBefore ?? defaultPreferences.notifyHoursBefore}
            disabled={isSaving}
            onChange={(event) =>
              void updatePreference({ key: "notifyHoursBefore", value: Number(event.target.value) }).catch(() => {})
            }
          >
            {[
              ...new Set([
                0,
                6,
                12,
                24,
                48,
                72,
                168,
                preferences?.notifyHoursBefore ?? defaultPreferences.notifyHoursBefore,
              ]),
            ]
              .sort((left, right) => left - right)
              .map((hours) => (
                <option key={hours} value={hours}>
                  {hours === 0
                    ? t("settings.reminderOnReleaseDay")
                    : t("settings.reminderHoursBefore", { count: hours })}
                </option>
              ))}
          </Select>
        </label>
        <p className="mt-2 text-caption text-muted-foreground">{t("settings.reminderLeadTimeDescription")}</p>
      </CardContent>
    </Card>
  );
}
