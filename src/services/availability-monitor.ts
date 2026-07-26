import { availabilityRepository } from "@/services/local/availability-repository";
import { mediaRepository } from "@/services/repositories/media-repository";
import { notificationService } from "@/services/notification-service";

export const availabilityMonitor = {
  async checkAll() {
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
          await notificationService.send(
            `${alert.title} est disponible`,
            `Une nouvelle plateforme correspond à votre alerte (${alert.region}).`,
          );
          changes += 1;
        }

        await availabilityRepository.saveSnapshot({
          mediaId: alert.mediaId,
          mediaType: alert.mediaType,
          region: alert.region,
          providerIds: current,
          checkedAt: new Date().toISOString(),
        });
      } catch {
        // Continue checking the remaining alerts when one provider request fails.
      }
    }

    return changes;
  },
};
