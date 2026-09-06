import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityAlert, AvailabilitySnapshot, WatchProviderAvailability } from "@/types/media";

const mocks = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  getSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
  getWatchAvailability: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/features/availability/availability-repository", () => ({
  availabilityRepository: {
    listAlerts: mocks.listAlerts,
    getSnapshot: mocks.getSnapshot,
    saveSnapshot: mocks.saveSnapshot,
  },
}));

vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: { getWatchAvailability: mocks.getWatchAvailability },
}));

vi.mock("@/features/desktop/notification-service", () => ({
  notificationService: { send: mocks.send },
}));

const loggerWarn = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: loggerWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { availabilityMonitor } from "../availability-monitor";

const alert = (overrides: Partial<AvailabilityAlert> = {}): AvailabilityAlert => ({
  id: "alert-1",
  profileId: "profile-1",
  mediaId: 42,
  mediaType: "movie",
  title: "Arrival",
  region: "FR",
  providerIds: [],
  enabled: true,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const availability = (providerIds: number[]): WatchProviderAvailability => ({
  region: "FR",
  flatrate: providerIds.map((id) => ({ id, name: `Provider ${id}` })),
  free: [],
  rent: [],
  buy: [],
});

const snapshot = (providerIds: number[]): AvailabilitySnapshot => ({
  mediaId: 42,
  mediaType: "movie",
  region: "FR",
  providerIds,
  checkedAt: new Date().toISOString(),
});

describe("availabilityMonitor.checkAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAlerts.mockResolvedValue([alert()]);
    mocks.getWatchAvailability.mockResolvedValue(availability([8]));
    mocks.getSnapshot.mockResolvedValue(snapshot([]));
  });

  it("sends a notification when a new provider appears and notifications are enabled", async () => {
    const outcome = await availabilityMonitor.checkAll({ notificationsEnabled: true });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(outcome.changes).toBe(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ providerIds: [8] }));
  });

  it("still tracks the change and updates the snapshot but stays silent when notifications are disabled", async () => {
    const outcome = await availabilityMonitor.checkAll({ notificationsEnabled: false });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(outcome.changes).toBe(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ providerIds: [8] }));
  });

  it("defaults to sending notifications when no option is passed", async () => {
    await availabilityMonitor.checkAll();

    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not notify when there is no previous snapshot to compare against", async () => {
    mocks.getSnapshot.mockResolvedValue(null);

    const outcome = await availabilityMonitor.checkAll({ notificationsEnabled: true });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(outcome.changes).toBe(0);
  });

  it("logs a warning and keeps checking the remaining alerts when one provider request fails", async () => {
    const failingAlert = alert({ id: "alert-failing", mediaId: 1, title: "Broken" });
    const okAlert = alert({ id: "alert-ok", mediaId: 42, title: "Arrival" });
    mocks.listAlerts.mockResolvedValue([failingAlert, okAlert]);
    mocks.getWatchAvailability.mockImplementation(async (_mediaType: string, mediaId: number) => {
      if (mediaId === 1) throw new Error("provider request failed");
      return availability([8]);
    });

    const outcome = await availabilityMonitor.checkAll({ notificationsEnabled: true });

    // The failing alert never reaches saveSnapshot; the healthy one after it
    // still gets fully processed.
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn.mock.calls[0]![0]).toContain("movie 1");
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 42, providerIds: [8] }));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(outcome.changes).toBe(1);
    // One of the two alerts threw — reported so the caller can tell a
    // partial outage from a clean run.
    expect(outcome).toMatchObject({ failures: 1, checked: 2 });
  });

  it("reports every alert as failed when the provider is entirely unreachable", async () => {
    mocks.listAlerts.mockResolvedValue([alert({ id: "a", mediaId: 1 }), alert({ id: "b", mediaId: 2 })]);
    mocks.getWatchAvailability.mockRejectedValue(new Error("TMDB unreachable"));

    const outcome = await availabilityMonitor.checkAll({ notificationsEnabled: true });

    // failures === checked is what lets App.tsx distinguish this total
    // outage from a genuinely quiet run; changes: 0 alone cannot.
    expect(outcome).toEqual({ changes: 0, failures: 2, checked: 2 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("reports nothing checked when no alert is enabled", async () => {
    mocks.listAlerts.mockResolvedValue([alert({ enabled: false })]);

    const outcome = await availabilityMonitor.checkAll({ notificationsEnabled: true });

    // checked: 0 must not read as a total outage (0 failures of 0 checks).
    expect(outcome).toEqual({ changes: 0, failures: 0, checked: 0 });
  });
});
