import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia } from "@/shared/test-utils";
import type { AvailabilityAlert, AvailabilitySnapshot } from "@/types/media";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const alert = (overrides: Partial<AvailabilityAlert> = {}): AvailabilityAlert => ({
  id: "test-id",
  profileId: "default",
  mediaId: 7,
  mediaType: "movie",
  title: "Alerte",
  region: "FR",
  providerIds: [8],
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const snapshot = (overrides: Partial<AvailabilitySnapshot> = {}): AvailabilitySnapshot => ({
  mediaId: 1,
  mediaType: "movie",
  region: "FR",
  providerIds: [8, 119],
  checkedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

// The toggle/remove/snapshot business logic now lives in Rust and is
// exercised there (see src-tauri/src/commands/availability.rs's own tests)
// — this only verifies the repository wraps invoke() with the right
// command name/args.
describe("availabilityRepository", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("listAlerts() invokes list_availability_alerts", async () => {
    invokeMock.mockResolvedValueOnce([alert()]);
    const { availabilityRepository } = await import("../availability-repository");

    await expect(availabilityRepository.listAlerts()).resolves.toEqual([alert()]);
    expect(invokeMock).toHaveBeenCalledWith("list_availability_alerts", undefined);
  });

  it("getAlert() invokes get_availability_alert with mediaId/mediaType", async () => {
    invokeMock.mockResolvedValueOnce(alert());
    const { availabilityRepository } = await import("../availability-repository");

    await availabilityRepository.getAlert(7, "movie");
    expect(invokeMock).toHaveBeenCalledWith("get_availability_alert", { mediaId: 7, mediaType: "movie" });
  });

  it("toggle() invokes toggle_availability_alert with media/region/providerIds", async () => {
    invokeMock.mockResolvedValueOnce(alert());
    const { availabilityRepository } = await import("../availability-repository");
    const media = makeMedia({ id: 7, title: "Alerte" });

    await availabilityRepository.toggle(media, "FR", [8]);
    expect(invokeMock).toHaveBeenCalledWith("toggle_availability_alert", { media, region: "FR", providerIds: [8] });
  });

  it("remove() invokes remove_availability_alert with the id", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { availabilityRepository } = await import("../availability-repository");

    await availabilityRepository.remove("test-id");
    expect(invokeMock).toHaveBeenCalledWith("remove_availability_alert", { id: "test-id" });
  });

  it("getSnapshot() invokes get_availability_snapshot with mediaId/mediaType/region", async () => {
    invokeMock.mockResolvedValueOnce(snapshot());
    const { availabilityRepository } = await import("../availability-repository");

    await availabilityRepository.getSnapshot(1, "movie", "FR");
    expect(invokeMock).toHaveBeenCalledWith("get_availability_snapshot", {
      mediaId: 1,
      mediaType: "movie",
      region: "FR",
    });
  });

  it("saveSnapshot() invokes save_availability_snapshot with the snapshot", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { availabilityRepository } = await import("../availability-repository");
    const s = snapshot();

    await availabilityRepository.saveSnapshot(s);
    expect(invokeMock).toHaveBeenCalledWith("save_availability_snapshot", { snapshot: s });
  });
});
