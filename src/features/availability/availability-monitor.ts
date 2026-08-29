import i18n from "@/i18n";
import { availabilityRepository } from "@/features/availability/availability-repository";
import { mediaRepository } from "@/features/media/media-repository";
import { notificationService } from "@/features/desktop/notification-service";
import { logger } from "@/shared/lib/logger";

export const availabilityMonitor = {
  async checkAll({ notificationsEnabled = true }: { notificationsEnabled?: boolean } = {}) {
    const alerts = (await availabilityRepository.listAlerts()).filter((item) => item.enabled);
    let changes = 0;

    for (const alert of alerts) {
      try {
        const availability = await mediaRepository.getWatchAvailability(alert.mediaType, alert.mediaId, alert.region);
        const current = [...availability.flatrate, ...availability.free].map((provider) => provider.id);
        const previous = await availabilityRepository.getSnapshot(alert.mediaId, alert.mediaType, alert.region);
        const preferred = alert.providerIds.length ? current.filter((id) => alert.providerIds.includes(id)) : current;
        const newProviders = preferred.filter((id) => !previous?.providerIds.includes(id));

        if (previous && newProviders.length) {
          changes += 1;
          if (notificationsEnabled) {
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
        logger.warn(`[availability] Check failed for ${alert.mediaType} ${alert.mediaId}: ${error}`);
      }
    }

    return changes;
  },
};
