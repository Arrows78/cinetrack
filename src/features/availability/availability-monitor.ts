import i18n from "@/i18n";
import { availabilityRepository } from "@/features/availability/availability-repository";
import { mediaRepository } from "@/features/media/media-repository";
import { notificationService } from "@/features/desktop";
import { logger } from "@/shared/lib/logger";
import type { AvailabilityAlert } from "@/types/media";

export interface AvailabilityCheckOutcome {
  /** Alerts whose provider set gained something the user asked to be told about. */
  changes: number;
  /** Alerts whose check threw (TMDB down, network, a single bad response). */
  failures: number;
  /** Enabled alerts actually attempted this run. */
  checked: number;
}

interface CheckAllOptions {
  alertsEnabled?: boolean;
  // Independent of alertsEnabled: alertsEnabled decides whether *this
  // category* is eligible to notify at all, this decides whether any
  // notification is allowed to pop as an OS desktop toast — same split as
  // notification-service.ts's notifyDue for calendar reminders.
  desktopNotificationsEnabled?: boolean;
  // Falls back to the profile's own preferred streaming services when an
  // alert has none of its own selected — previously fell back to "every
  // platform", so an alert with no explicit provider notified for a
  // service the user doesn't even subscribe to.
  preferredProviderIds?: number[];
}

// The boot-time check and the recurring interval can overlap (a slow TMDB
// run outlasting the interval): a second pass reading the snapshots before
// the first wrote them back would notify for the same new provider again.
// An overlapping call joins the pass already running.
let inFlight: Promise<AvailabilityCheckOutcome> | null = null;

export const availabilityMonitor = {
  checkAll(options: CheckAllOptions = {}): Promise<AvailabilityCheckOutcome> {
    if (inFlight) return inFlight;
    const run = this.runCheck(options).finally(() => {
      inFlight = null;
    });
    inFlight = run;
    return run;
  },

  /**
   * Records what is available right now as the baseline for a just-created
   * alert. Without it the first scheduled check would be the baseline, so a
   * provider added between creating the alert and that check (up to the whole
   * check interval) was absorbed silently and never notified. Best effort:
   * a failure only means the first scheduled check seeds it, as before.
   */
  async seedBaseline(alert: Pick<AvailabilityAlert, "mediaId" | "mediaType" | "region">): Promise<boolean> {
    try {
      const existing = await availabilityRepository.getSnapshot(alert.mediaId, alert.mediaType, alert.region);
      if (existing) return false;
      const availability = await mediaRepository.getWatchAvailability(alert.mediaType, alert.mediaId, alert.region);
      await availabilityRepository.saveSnapshot({
        mediaId: alert.mediaId,
        mediaType: alert.mediaType,
        region: alert.region,
        providerIds: [...availability.flatrate, ...availability.free].map((provider) => provider.id),
        checkedAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      logger.warn(`[availability] Could not seed the baseline for ${alert.mediaType} ${alert.mediaId}: ${error}`);
      return false;
    }
  },

  async runCheck({
    alertsEnabled = true,
    desktopNotificationsEnabled = true,
    preferredProviderIds = [],
  }: CheckAllOptions): Promise<AvailabilityCheckOutcome> {
    const alerts = (await availabilityRepository.listAlerts()).filter((item) => item.enabled);
    let changes = 0;
    let failures = 0;

    for (const alert of alerts) {
      try {
        const availability = await mediaRepository.getWatchAvailability(alert.mediaType, alert.mediaId, alert.region);
        const current = [...availability.flatrate, ...availability.free].map((provider) => provider.id);
        const previous = await availabilityRepository.getSnapshot(alert.mediaId, alert.mediaType, alert.region);
        const relevantProviderIds = alert.providerIds.length ? alert.providerIds : preferredProviderIds;
        const preferred = relevantProviderIds.length
          ? current.filter((id) => relevantProviderIds.includes(id))
          : current;
        const newProviders = preferred.filter((id) => !previous?.providerIds.includes(id));

        if (previous && newProviders.length) {
          changes += 1;
          if (alertsEnabled && desktopNotificationsEnabled) {
            await notificationService.send(
              i18n.t("notifications.availabilityTitle", { title: alert.title }),
              i18n.t("notifications.availabilityBody", { region: alert.region })
            );
          }
        }

        await availabilityRepository.saveSnapshot({
          mediaId: alert.mediaId,
          mediaType: alert.mediaType,
          region: alert.region,
          providerIds: current,
          checkedAt: new Date().toISOString(),
        });
      } catch (error) {
        // Continue checking the remaining alerts when one provider request fails.
        failures += 1;
        logger.warn(`[availability] Check failed for ${alert.mediaType} ${alert.mediaId}: ${error}`);
      }
    }

    // The caller needs `failures` to tell "checked everything, nothing new"
    // apart from "every check threw" — both used to come back as changes: 0,
    // so a total TMDB outage was indistinguishable from a quiet day and the
    // user was never told their alerts had stopped working.
    return { changes, failures, checked: alerts.length };
  },
};
