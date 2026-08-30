import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { CalendarEntry, UserPreferences } from "@/types/media";

const mocks = vi.hoisted(() => ({
  isTauriApp: vi.fn(() => false),
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: mocks.isTauriApp }));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: (...args: unknown[]) => mocks.isPermissionGranted(...args),
  requestPermission: (...args: unknown[]) => mocks.requestPermission(...args),
  sendNotification: (...args: unknown[]) => mocks.sendNotification(...args),
}));

import { notificationService } from "../notification-service";

const SENT_KEY = "cinetrack.sent-notifications.v1";

type MockNotificationCtor = typeof Notification & {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
};

/** Stubs a controllable `Notification` global (jsdom doesn't provide one). */
function stubNotification(permission: NotificationPermission): MockNotificationCtor {
  const ctor = vi.fn(function (this: unknown, title: string, options?: NotificationOptions) {
    (this as { title: string; options?: NotificationOptions }).title = title;
    (this as { title: string; options?: NotificationOptions }).options = options;
  }) as unknown as MockNotificationCtor;
  ctor.permission = permission;
  ctor.requestPermission = vi.fn<() => Promise<NotificationPermission>>();
  vi.stubGlobal("Notification", ctor);
  return ctor;
}

const basePreferences: UserPreferences = {
  theme: "dark",
  accentColor: "violet",
  language: "en",
  region: "US",
  defaultSearchType: "all",
  reduceMotion: false,
  compactMode: false,
  sidebarCollapsed: false,
  libraryViewMode: "grid",
  spoilerProtection: false,
  notificationsEnabled: true,
  notifyHoursBefore: 24,
  preferredProviderIds: [],
  activeProfileId: "profile-1",
  backupDirectory: null,
  hideWatchedInDiscovery: false,
  onThisDayEnabled: false,
  onboardingCompleted: false,
  userProfile: { id: "profile-1", name: "Profile" },
};

const episodeEntry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: "entry-episode",
  mediaId: 10,
  mediaType: "series",
  title: "My Series",
  date: "2026-01-16",
  kind: "episode",
  seasonNumber: 2,
  episodeNumber: 5,
  episodeTitle: "The Reckoning",
  ...overrides,
});

const movieEntry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: "entry-movie",
  mediaId: 20,
  mediaType: "movie",
  title: "My Movie",
  date: "2026-01-16",
  kind: "movie-release",
  ...overrides,
});

describe("notificationService", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    mocks.isTauriApp.mockReturnValue(false);
    mocks.isPermissionGranted.mockReset();
    mocks.requestPermission.mockReset();
    mocks.sendNotification.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  describe("isPermissionGranted", () => {
    it("returns false outside Tauri when Notification is absent from window", async () => {
      // jsdom doesn't implement the Notification API by default, so no stub
      // means the "Notification" in window check itself is false.
      await expect(notificationService.isPermissionGranted()).resolves.toBe(false);
    });

    it("returns true outside Tauri when Notification permission is granted", async () => {
      stubNotification("granted");
      await expect(notificationService.isPermissionGranted()).resolves.toBe(true);
    });

    it("returns false outside Tauri when Notification permission is not granted", async () => {
      stubNotification("default");
      await expect(notificationService.isPermissionGranted()).resolves.toBe(false);
    });

    it("delegates to the Tauri plugin inside Tauri", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.isPermissionGranted.mockResolvedValue(true);

      await expect(notificationService.isPermissionGranted()).resolves.toBe(true);
      expect(mocks.isPermissionGranted).toHaveBeenCalledTimes(1);
    });
  });

  describe("requestPermission", () => {
    it("returns false outside Tauri when Notification is absent from window", async () => {
      await expect(notificationService.requestPermission()).resolves.toBe(false);
    });

    it("returns false outside Tauri when permission is denied", async () => {
      const ctor = stubNotification("denied");
      await expect(notificationService.requestPermission()).resolves.toBe(false);
      expect(ctor.requestPermission).not.toHaveBeenCalled();
    });

    it("returns true outside Tauri when permission is already granted, without prompting", async () => {
      const ctor = stubNotification("granted");
      await expect(notificationService.requestPermission()).resolves.toBe(true);
      expect(ctor.requestPermission).not.toHaveBeenCalled();
    });

    it("prompts outside Tauri when permission is default, and resolves granted", async () => {
      const ctor = stubNotification("default");
      ctor.requestPermission.mockResolvedValue("granted");

      await expect(notificationService.requestPermission()).resolves.toBe(true);
      expect(ctor.requestPermission).toHaveBeenCalledTimes(1);
    });

    it("prompts outside Tauri when permission is default, and resolves non-granted", async () => {
      const ctor = stubNotification("default");
      ctor.requestPermission.mockResolvedValue("denied");

      await expect(notificationService.requestPermission()).resolves.toBe(false);
      expect(ctor.requestPermission).toHaveBeenCalledTimes(1);
    });

    it("inside Tauri, short-circuits when permission is already granted", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.isPermissionGranted.mockResolvedValue(true);

      await expect(notificationService.requestPermission()).resolves.toBe(true);
      expect(mocks.requestPermission).not.toHaveBeenCalled();
    });

    it("inside Tauri, falls through to requestPermission and resolves granted", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.isPermissionGranted.mockResolvedValue(false);
      mocks.requestPermission.mockResolvedValue("granted");

      await expect(notificationService.requestPermission()).resolves.toBe(true);
      expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
    });

    it("inside Tauri, falls through to requestPermission and resolves non-granted", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.isPermissionGranted.mockResolvedValue(false);
      mocks.requestPermission.mockResolvedValue("denied");

      await expect(notificationService.requestPermission()).resolves.toBe(false);
      expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
    });
  });

  describe("send", () => {
    it("returns early without sending when permission is not granted", async () => {
      // No Notification stub at all => isPermissionGranted() resolves false.
      await notificationService.send("Title", "Body");
      expect(mocks.sendNotification).not.toHaveBeenCalled();
    });

    it("sends a browser Notification outside Tauri when permission is granted", async () => {
      const ctor = stubNotification("granted");

      await notificationService.send("Title", "Body");

      expect(ctor).toHaveBeenCalledWith("Title", { body: "Body" });
    });

    it("sends via the Tauri plugin inside Tauri when permission is granted", async () => {
      mocks.isTauriApp.mockReturnValue(true);
      mocks.isPermissionGranted.mockResolvedValue(true);

      await notificationService.send("Title", "Body");

      expect(mocks.sendNotification).toHaveBeenCalledWith({ title: "Title", body: "Body" });
    });
  });

  describe("notifyDue", () => {
    beforeEach(() => {
      vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    });

    it("returns 0 immediately when notifications are disabled", async () => {
      const preferences: UserPreferences = { ...basePreferences, notificationsEnabled: false };

      const count = await notificationService.notifyDue([episodeEntry()], preferences);

      expect(count).toBe(0);
      expect(mocks.sendNotification).not.toHaveBeenCalled();
    });

    it("returns 0 when permission is not granted", async () => {
      // No Notification stub => permission check resolves false outside Tauri.
      const count = await notificationService.notifyDue([episodeEntry()], basePreferences);

      expect(count).toBe(0);
    });

    it("skips entries whose release date is already past", async () => {
      stubNotification("granted");
      const entry = episodeEntry({ date: "2026-01-10" });

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(0);
      expect(localStorage.getItem(SENT_KEY)).toBe(JSON.stringify([]));
    });

    it("skips entries further out than notifyHoursBefore", async () => {
      stubNotification("granted");
      const entry = episodeEntry({ date: "2026-02-15" });
      const preferences: UserPreferences = { ...basePreferences, notifyHoursBefore: 24 };

      const count = await notificationService.notifyDue([entry], preferences);

      expect(count).toBe(0);
    });

    it("skips entries already recorded as sent", async () => {
      stubNotification("granted");
      const entry = episodeEntry({ id: "already-sent" });
      localStorage.setItem(SENT_KEY, JSON.stringify(["already-sent"]));

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(0);
      expect(mocks.sendNotification).not.toHaveBeenCalled();
    });

    it("falls back to an empty sent-set when localStorage holds corrupt JSON", async () => {
      const ctor = stubNotification("granted");
      localStorage.setItem(SENT_KEY, "{not valid json");
      const entry = episodeEntry();

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(1);
      expect(ctor).toHaveBeenCalledTimes(1);
    });

    it("falls back to an empty sent-set when localStorage holds valid JSON that isn't an array", async () => {
      const ctor = stubNotification("granted");
      localStorage.setItem(SENT_KEY, JSON.stringify({ not: "an array" }));
      const entry = episodeEntry();

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(1);
      expect(ctor).toHaveBeenCalledTimes(1);
    });

    it("ignores non-string entries in a stored sent-set array", async () => {
      const ctor = stubNotification("granted");
      localStorage.setItem(SENT_KEY, JSON.stringify([1, null, "already-sent"]));
      const entry = episodeEntry({ id: "already-sent" });

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(0);
      expect(ctor).not.toHaveBeenCalled();
    });

    it("sends and counts an episode entry, using its episode title", async () => {
      const ctor = stubNotification("granted");
      const entry = episodeEntry({ episodeTitle: "The Reckoning" });

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(1);
      const expectedBody = i18n.t("notifications.episodeBody", {
        season: entry.seasonNumber,
        episode: entry.episodeNumber,
        title: "The Reckoning",
      });
      expect(ctor).toHaveBeenCalledWith(entry.title, { body: expectedBody });
    });

    it("falls back to the generic episode title when episodeTitle is missing", async () => {
      const ctor = stubNotification("granted");
      const entry = episodeEntry({ episodeTitle: undefined });

      await notificationService.notifyDue([entry], basePreferences);

      const expectedBody = i18n.t("notifications.episodeBody", {
        season: entry.seasonNumber,
        episode: entry.episodeNumber,
        title: i18n.t("tracking.newEpisodeFallback"),
      });
      expect(ctor).toHaveBeenCalledWith(entry.title, { body: expectedBody });
    });

    it("sends and counts a theatrical-release entry", async () => {
      const ctor = stubNotification("granted");
      const entry = movieEntry();

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(1);
      const expectedBody = i18n.t("notifications.theatricalReleaseBody");
      expect(ctor).toHaveBeenCalledWith(entry.title, { body: expectedBody });
    });

    it("persists sent ids and caps the stored list at 500, dropping the oldest", async () => {
      stubNotification("granted");
      const seeded = Array.from({ length: 501 }, (_, index) => `id-${index}`);
      localStorage.setItem(SENT_KEY, JSON.stringify(seeded));
      const entry = episodeEntry({ id: "new-entry" });

      const count = await notificationService.notifyDue([entry], basePreferences);

      expect(count).toBe(1);
      const persisted = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as string[];
      expect(persisted).toHaveLength(500);
      expect(persisted).not.toContain("id-0");
      expect(persisted).toContain("new-entry");
    });
  });
});
