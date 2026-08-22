import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { queryKeys } from "@/shared/constants/query-keys";
import type { AvailabilityAlert, AvailabilitySnapshot, MediaSummary } from "@/types/media";

const media: MediaSummary = {
  id: 7,
  mediaType: "movie",
  title: "Test Movie",
  overview: "",
  genres: [],
  cast: [],
};

const alert: AvailabilityAlert = {
  id: "alert-1",
  mediaId: media.id,
  mediaType: media.mediaType,
  title: media.title,
  region: "FR",
  providerIds: [8],
} as AvailabilityAlert;

const listAlertsMock = vi.fn(async (): Promise<AvailabilityAlert[]> => [alert]);
const getAlertMock = vi.fn<(mediaId: number, mediaType: string) => Promise<AvailabilityAlert | null>>(async () => null);
const toggleMock = vi.fn<
  (media: MediaSummary, region: string, providerIds: number[]) => Promise<AvailabilityAlert | null>
>(async () => alert);
const removeMock = vi.fn<(id: string) => Promise<undefined>>(async () => undefined);
const snapshot: AvailabilitySnapshot = {
  mediaId: 1,
  mediaType: "movie",
  region: "FR",
  providerIds: [8],
  checkedAt: "2026-01-01T00:00:00.000Z",
};
const listSnapshotsMock = vi.fn(async (): Promise<AvailabilitySnapshot[]> => [snapshot]);
// useActiveProfileId() (see use-preferences.ts) resolves to this via
// preferencesRepository.getPreferences() — fixed to "default" so every key
// assertion below is deterministic regardless of when it resolves (it
// matches useActiveProfileId's own pre-resolution fallback too).
const getPreferencesMock = vi.fn(async () => ({ activeProfileId: DEFAULT_PROFILE_ID }) as never);

vi.mock("@/features/availability/availability-repository", () => ({
  availabilityRepository: {
    listAlerts: () => listAlertsMock(),
    getAlert: (mediaId: number, mediaType: string) => getAlertMock(mediaId, mediaType),
    toggle: (mediaArg: MediaSummary, region: string, providerIds: number[]) =>
      toggleMock(mediaArg, region, providerIds),
    remove: (id: string) => removeMock(id),
    listSnapshots: () => listSnapshotsMock(),
  },
}));

vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: { getPreferences: getPreferencesMock },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    Wrapper: function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    },
  };
}

beforeEach(() => {
  listAlertsMock.mockClear().mockResolvedValue([alert]);
  getAlertMock.mockClear().mockResolvedValue(null);
  toggleMock.mockClear().mockResolvedValue(alert);
  removeMock.mockClear().mockResolvedValue(undefined);
  listSnapshotsMock.mockClear().mockResolvedValue([snapshot]);
  getPreferencesMock.mockClear();
});

describe("useAvailabilityAlerts", () => {
  it("loads the alert list for the active profile", async () => {
    const { useAvailabilityAlerts } = await import("../use-availability-alerts");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAvailabilityAlerts(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([alert]);
    expect(listAlertsMock).toHaveBeenCalledTimes(1);
  });

  it("removing an alert invalidates the alert list and tracking queries", async () => {
    const { useAvailabilityAlerts } = await import("../use-availability-alerts");
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAvailabilityAlerts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.remove(alert.id);
    });

    expect(removeMock).toHaveBeenCalledWith(alert.id);
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.availabilityAlerts(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.tracking(DEFAULT_PROFILE_ID));
  });
});

describe("useAvailabilityAlert", () => {
  it("is disabled when options.enabled is false", async () => {
    const { useAvailabilityAlert } = await import("../use-availability-alerts");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAvailabilityAlert(media, "FR", [8], { enabled: false }), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getAlertMock).not.toHaveBeenCalled();
  });

  it("loads the per-media alert when enabled (default)", async () => {
    const { useAvailabilityAlert } = await import("../use-availability-alerts");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAvailabilityAlert(media, "FR", [8]), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getAlertMock).toHaveBeenCalledWith(media.id, media.mediaType);
  });

  it("toggling sets the per-media cache entry and invalidates the list and tracking queries", async () => {
    const { useAvailabilityAlert } = await import("../use-availability-alerts");
    const { client, Wrapper } = createWrapper();
    const setQueryDataSpy = vi.spyOn(client, "setQueryData");
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAvailabilityAlert(media, "FR", [8]), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(toggleMock).toHaveBeenCalledWith(media, "FR", [8]);

    const perMediaKey = [...queryKeys.local.availabilityAlerts(DEFAULT_PROFILE_ID), media.mediaType, media.id];
    expect(setQueryDataSpy).toHaveBeenCalledWith(perMediaKey, alert);

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.availabilityAlerts(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.tracking(DEFAULT_PROFILE_ID));
  });
});

describe("useAvailabilitySnapshots", () => {
  it("loads every cached snapshot under the shared, non-profile-scoped query key", async () => {
    const { useAvailabilitySnapshots } = await import("../use-availability-alerts");
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAvailabilitySnapshots(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([snapshot]);
    expect(listSnapshotsMock).toHaveBeenCalledTimes(1);
  });
});
