import { differenceInHours, endOfDay, isAfter, parseISO, startOfDay } from "date-fns";
import i18n from "@/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { isTauriApp } from "@/shared/lib/platform";
import type { CalendarEntry, UserPreferences } from "@/types/media";
import { sentNotificationsKey } from "@/shared/constants/local-storage-keys";

// A reminder delivered to one viewer must not consume another viewer's reminder.
/** Maximum number of sent notification IDs retained to prevent re-notifying. */
const MAX_SENT_NOTIFICATIONS = 500;

function readSentNotifications(profileId: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(sentNotificationsKey(profileId)) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

// Passes run one after another: the boot-time check and the recurring
// interval can overlap, and two passes reading the sent-set before either
// has written it back would each show the same reminder.
let dueQueue: Promise<unknown> = Promise.resolve();

export const notificationService = {
  async isPermissionGranted(): Promise<boolean> {
    if (!isTauriApp()) return "Notification" in window && Notification.permission === "granted";
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    return isPermissionGranted();
  },

  async requestPermission(): Promise<boolean> {
    if (!isTauriApp()) {
      if (!("Notification" in window) || Notification.permission === "denied") return false;
      if (Notification.permission === "granted") return true;
      return (await Notification.requestPermission()) === "granted";
    }
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) || (await requestPermission()) === "granted";
  },

  async send(title: string, body: string): Promise<void> {
    if (!(await this.isPermissionGranted())) return;
    if (!isTauriApp()) {
      new Notification(title, { body });
      return;
    }
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    await Promise.resolve(sendNotification({ title, body }));
  },

  notifyDue(entries: CalendarEntry[], preferences: UserPreferences): Promise<number> {
    const run = dueQueue.then(() => this.deliverDue(entries, preferences));
    dueQueue = run.catch(() => undefined);
    return run;
  },

  async deliverDue(entries: CalendarEntry[], preferences: UserPreferences): Promise<number> {
    if (
      !preferences.notificationsEnabled ||
      !preferences.desktopNotificationsEnabled ||
      !(await this.isPermissionGranted())
    )
      return 0;
    const sent = readSentNotifications(preferences.activeProfileId);
    let count = 0;
    const now = new Date();
    // Saved even when a send throws partway: otherwise every notification
    // already shown in this pass would be shown again on the next one.
    try {
      for (const entry of entries) {
        const releaseDate = parseISO(entry.date);
        const hours = differenceInHours(startOfDay(releaseDate), now);
        if (isAfter(now, endOfDay(releaseDate)) || hours > preferences.notifyHoursBefore || sent.has(entry.id))
          continue;
        const body =
          entry.kind === "episode"
            ? i18n.t("notifications.episodeBody", {
                season: entry.seasonNumber,
                episode: entry.episodeNumber,
                title: entry.episodeTitle ?? i18n.t("tracking.newEpisodeFallback"),
              })
            : i18n.t("notifications.theatricalReleaseBody");
        await this.send(entry.title, body);
        sent.add(entry.id);
        count += 1;
      }
    } finally {
      // Guarded: a storage failure here (quota, blocked storage) must not
      // replace the error a failed send is already propagating.
      try {
        localStorage.setItem(
          sentNotificationsKey(preferences.activeProfileId),
          JSON.stringify([...sent].slice(-MAX_SENT_NOTIFICATIONS))
        );
      } catch (error) {
        logger.warn(`Could not persist the sent-notifications record: ${errorMessage(error)}`);
      }
    }
    return count;
  },
};
