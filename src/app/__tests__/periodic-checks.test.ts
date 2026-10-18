import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAutomaticBackup: vi.fn(),
  getPreferences: vi.fn(),
  checkAll: vi.fn(),
  buildNotifiableCalendarEntries: vi.fn(),
  notifyDue: vi.fn(),
  toast: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/features/backup/maintenance-service", () => ({
  maintenanceService: { createAutomaticBackup: () => mocks.createAutomaticBackup() },
}));
vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: { getPreferences: () => mocks.getPreferences() },
}));
vi.mock("@/features/availability/availability-monitor", () => ({
  availabilityMonitor: { checkAll: (...args: unknown[]) => mocks.checkAll(...args) },
}));
vi.mock("@/features/tracking/tracking-service", () => ({
  trackingService: { buildNotifiableCalendarEntries: () => mocks.buildNotifiableCalendarEntries() },
}));
vi.mock("@/features/desktop/notification-service", () => ({
  notificationService: { notifyDue: (...args: unknown[]) => mocks.notifyDue(...args) },
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => mocks.toast(...args) }));
vi.mock("@/shared/lib/logger", () => ({
  logger: { info: vi.fn(), warn: (...args: unknown[]) => mocks.loggerWarn(...args), error: vi.fn() },
}));

import { runPeriodicChecks } from "../periodic-checks";
import { queryClient } from "../query-client";
import { queryKeys } from "@/shared/constants/query-keys";

const preferences = {
  activeProfileId: "default",
  availabilityAlertsEnabled: true,
  desktopNotificationsEnabled: true,
  preferredProviderIds: [8],
  notificationsEnabled: true,
};

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  mocks.createAutomaticBackup.mockResolvedValue(undefined);
  mocks.getPreferences.mockResolvedValue(preferences);
  mocks.checkAll.mockResolvedValue({ checked: 0, failures: 0 });
  mocks.buildNotifiableCalendarEntries.mockResolvedValue([]);
  mocks.notifyDue.mockResolvedValue(0);
});

// An app left running in the tray is only "started" once: the automatic
// backup chosen as daily or weekly must not wait for the next launch.
describe("runPeriodicChecks", () => {
  it("refreshes visible availability and agenda data after a successful background check", async () => {
    const keys = [queryKeys.local.availabilitySnapshots, queryKeys.local.tracking("default")];
    for (const key of keys) queryClient.setQueryData(key, []);
    mocks.checkAll.mockResolvedValue({ checked: 1, failures: 0, changes: 1 });
    await runPeriodicChecks();
    for (const key of keys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("takes the automatic backup when it is due, then runs the notification checks", async () => {
    await runPeriodicChecks();

    expect(mocks.createAutomaticBackup).toHaveBeenCalledTimes(1);
    expect(mocks.checkAll).toHaveBeenCalledTimes(1);
    expect(mocks.notifyDue).toHaveBeenCalledTimes(1);
  });

  it("still checks notifications when the backup fails, and logs the failure", async () => {
    mocks.createAutomaticBackup.mockRejectedValue(new Error("folder not writable"));

    await runPeriodicChecks();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining("folder not writable"));
    expect(mocks.checkAll).toHaveBeenCalledTimes(1);
    expect(mocks.notifyDue).toHaveBeenCalledTimes(1);
  });

  it("skips calendar reminders when they are switched off", async () => {
    mocks.getPreferences.mockResolvedValue({ ...preferences, notificationsEnabled: false });

    await runPeriodicChecks();

    expect(mocks.notifyDue).not.toHaveBeenCalled();
  });
});
