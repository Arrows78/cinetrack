import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEntry, UserPreferences } from "@/types/media";

const mocks = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: (...args: unknown[]) => mocks.isPermissionGranted(...args),
  requestPermission: vi.fn(),
  sendNotification: (...args: unknown[]) => mocks.sendNotification(...args),
}));

import { notificationService } from "../notification-service";

const preferences = {
  notificationsEnabled: true,
  desktopNotificationsEnabled: true,
  notifyHoursBefore: 0,
} as UserPreferences;

const entry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: "episode-1-2026-03-09",
  mediaId: 1,
  mediaType: "series",
  title: "Show",
  date: "2026-03-09",
  kind: "episode",
  seasonNumber: 1,
  episodeNumber: 1,
  ...overrides,
});

// Run under several TZ values (TZ=America/New_York, TZ=Pacific/Kiritimati):
// a date-only air date is a local calendar day in every one of them.
describe("notificationService.notifyDue timing", () => {
  beforeEach(() => {
    mocks.isPermissionGranted.mockResolvedValue(true);
    mocks.sendNotification.mockReset();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("does not remind the evening before when the reminder is set to the day itself", async () => {
    vi.setSystemTime(new Date(2026, 2, 8, 23, 0));
    expect(await notificationService.notifyDue([entry()], preferences)).toBe(0);
  });

  it("reminds on the morning of the air date", async () => {
    vi.setSystemTime(new Date(2026, 2, 9, 8, 0));
    expect(await notificationService.notifyDue([entry()], preferences)).toBe(1);
  });

  it("stops reminding once the air day is over", async () => {
    vi.setSystemTime(new Date(2026, 2, 10, 0, 30));
    expect(await notificationService.notifyDue([entry()], preferences)).toBe(0);
  });

  it("reminds across the spring-forward night for a 24 hour reminder", async () => {
    // 2026-03-08 is the US DST change: the night before an air date on the
    // 9th is only 23 elapsed hours long in New York.
    vi.setSystemTime(new Date(2026, 2, 8, 0, 30));
    expect(await notificationService.notifyDue([entry()], { ...preferences, notifyHoursBefore: 24 })).toBe(1);
  });

  it("sends a single reminder when two checks overlap", async () => {
    vi.setSystemTime(new Date(2026, 2, 9, 8, 0));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.sendNotification.mockImplementation(() => gate);

    const first = notificationService.notifyDue([entry()], preferences);
    const second = notificationService.notifyDue([entry()], preferences);
    await vi.advanceTimersByTimeAsync(0);
    release();
    await Promise.all([first, second]);

    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });
});
