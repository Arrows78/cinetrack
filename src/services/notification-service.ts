import { differenceInHours, parseISO } from "date-fns";
import { isTauriApp } from "@/shared/lib/platform";
import type { CalendarEntry, UserPreferences } from "@/types/media";

const SENT_KEY = "cinetrack.sent-notifications.v1";

export const notificationService = {
  async requestPermission(): Promise<boolean> {
    if (!isTauriApp()) return "Notification" in window && (await Notification.requestPermission()) === "granted";
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) || (await requestPermission()) === "granted";
  },

  async send(title: string, body: string): Promise<void> {
    if (!isTauriApp()) { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body }); return; }
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
  },

  async notifyDue(entries: CalendarEntry[], preferences: UserPreferences): Promise<number> {
    if (!preferences.notificationsEnabled || !(await this.requestPermission())) return 0;
    const sent = new Set<string>(JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as string[]);
    let count = 0;
    for (const entry of entries) {
      const hours = differenceInHours(parseISO(entry.date), new Date());
      if (hours < 0 || hours > preferences.notifyHoursBefore || sent.has(entry.id)) continue;
      const body = entry.kind === "episode"
        ? `S${entry.seasonNumber}E${entry.episodeNumber} · ${entry.episodeTitle ?? "Nouvel épisode"}`
        : "Sortie cinéma aujourd’hui ou très bientôt.";
      await this.send(entry.title, body);
      sent.add(entry.id); count += 1;
    }
    localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-500)));
    return count;
  },
};
