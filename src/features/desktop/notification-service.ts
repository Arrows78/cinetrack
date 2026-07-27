import { differenceInHours, endOfDay, isAfter, parseISO, startOfDay } from "date-fns";
import { isTauriApp } from "@/shared/lib/platform";
import type { CalendarEntry, UserPreferences } from "@/types/media";

const SENT_KEY = "cinetrack.sent-notifications.v1";

function readSentNotifications(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

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

  async notifyDue(entries: CalendarEntry[], preferences: UserPreferences): Promise<number> {
    if (!preferences.notificationsEnabled || !(await this.isPermissionGranted())) return 0;
    const sent = readSentNotifications();
    let count = 0;
    const now = new Date();
    for (const entry of entries) {
      const releaseDate = parseISO(entry.date);
      const hours = differenceInHours(startOfDay(releaseDate), now);
      if (isAfter(now, endOfDay(releaseDate)) || hours > preferences.notifyHoursBefore || sent.has(entry.id)) continue;
      const body =
        entry.kind === "episode"
          ? `S${entry.seasonNumber}E${entry.episodeNumber} · ${entry.episodeTitle ?? "Nouvel épisode"}`
          : "Sortie cinéma aujourd’hui ou très bientôt.";
      await this.send(entry.title, body);
      sent.add(entry.id);
      count += 1;
    }
    localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-500)));
    return count;
  },
};
