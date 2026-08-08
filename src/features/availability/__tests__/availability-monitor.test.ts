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
    const changes = await availabilityMonitor.checkAll({ notificationsEnabled: true });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(changes).toBe(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ providerIds: [8] }));
  });

  it("still tracks the change and updates the snapshot but stays silent when notifications are disabled", async () => {
    const changes = await availabilityMonitor.checkAll({ notificationsEnabled: false });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(changes).toBe(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ providerIds: [8] }));
  });

  it("defaults to sending notifications when no option is passed", async () => {
    await availabilityMonitor.checkAll();

    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not notify when there is no previous snapshot to compare against", async () => {
    mocks.getSnapshot.mockResolvedValue(null);

    const changes = await availabilityMonitor.checkAll({ notificationsEnabled: true });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(changes).toBe(0);
  });
});
