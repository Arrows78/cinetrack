import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { queryKeys } from "@/shared/constants/query-keys";
import type { AvailabilityAlert, MediaSummary } from "@/types/media";

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
const getAlertMock = vi.fn(async (_mediaId: number, _mediaType: string): Promise<AvailabilityAlert | null> => null);
const toggleMock = vi.fn(
  async (_media: MediaSummary, _region: string, _providerIds: number[]): Promise<AvailabilityAlert | null> => alert
);
const removeMock = vi.fn(async (_id: string): Promise<undefined> => undefined);
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
