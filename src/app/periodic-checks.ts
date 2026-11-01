import i18n from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import { availabilityMonitor } from "@/features/availability/availability-monitor";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { notificationService } from "@/features/desktop/notification-service";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { trackingService } from "@/features/tracking/tracking-service";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { queryClient } from "@/app/query-client";
import { queryKeys } from "@/shared/constants/query-keys";

/** Availability alerts, then the calendar reminders — both honour their own preference. */
export async function checkBackgroundNotifications(): Promise<void> {
  const preferences = await preferencesRepository.getPreferences();
  const availabilityOutcome = await availabilityMonitor.checkAll({
    alertsEnabled: preferences.availabilityAlertsEnabled,
    desktopNotificationsEnabled: preferences.desktopNotificationsEnabled,
    preferredProviderIds: preferences.preferredProviderIds,
  });
  if (availabilityOutcome.checked > availabilityOutcome.failures) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.local.availabilitySnapshots }),
      queryClient.invalidateQueries({ queryKey: queryKeys.local.tracking(preferences.activeProfileId) }),
    ]);
  }
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

/**
 * Installs the periodic maintenance loop and wakes it immediately when a
 * suspended mobile/desktop webview becomes visible again. Browsers pause or
 * heavily throttle timers in the background, so waiting for the next interval
 * after resume can leave backups/availability reminders stale for hours.
 *
 * Overlapping wake/timer ticks share one in-flight pass.
 */
export function startPeriodicChecks(intervalMs: number): () => void {
  let inFlight: Promise<void> | null = null;

  const run = () => {
    if (inFlight) return;
    inFlight = runPeriodicChecks()
      .catch((error: unknown) => {
        logger.warn(`Background notification check failed: ${errorMessage(error)}`);
      })
      .finally(() => {
        inFlight = null;
      });
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") run();
  };

  const interval = window.setInterval(run, intervalMs);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

