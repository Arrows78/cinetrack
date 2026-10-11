import i18n from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import { availabilityMonitor } from "@/features/availability/availability-monitor";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { notificationService } from "@/features/desktop/notification-service";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { trackingService } from "@/features/tracking/tracking-service";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

/** Availability alerts, then the calendar reminders — both honour their own preference. */
export async function checkBackgroundNotifications(): Promise<void> {
  const preferences = await preferencesRepository.getPreferences();
  const availabilityOutcome = await availabilityMonitor.checkAll({
    alertsEnabled: preferences.availabilityAlertsEnabled,
    desktopNotificationsEnabled: preferences.desktopNotificationsEnabled,
    preferredProviderIds: preferences.preferredProviderIds,
  });
  // Every single alert failing is a real outage (TMDB down, no network),
  // not a quiet day — say so once, rather than letting the user believe
  // their alerts are working. A partial failure stays log-only: the
  // alerts that did succeed still did their job.
  if (availabilityOutcome.checked > 0 && availabilityOutcome.failures === availabilityOutcome.checked) {
    toast({ description: i18n.t("tracking.availabilityCheckFailed"), variant: "error" });
  }
  if (!preferences.notificationsEnabled) return;
  // Only entries the user actually tracks (library movies, tracked-series
  // episodes) can reach a notification — see buildNotifiableCalendarEntries.
  const entries = await trackingService.buildNotifiableCalendarEntries();
  await notificationService.notifyDue(entries, preferences);
}

/**
 * What the background timer runs. The automatic backup is part of it: the
 * frequency setting (daily, weekly) is enforced inside `createAutomaticBackup`
 * itself, so calling it on every tick is cheap — and an app left running in
 * the tray for days would otherwise only ever back up at launch.
 */
export async function runPeriodicChecks(): Promise<void> {
  try {
    await maintenanceService.createAutomaticBackup();
  } catch (error) {
    logger.warn(`Periodic automatic backup failed: ${errorMessage(error)}`);
  }
  await checkBackgroundNotifications();
}
