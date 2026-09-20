import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const getStatusMock = vi.fn();
const listConflictsMock = vi.fn();
vi.mock("@/features/sync/sync-repository", () => ({
  syncRepository: {
    getStatus: (...args: unknown[]) => getStatusMock(...args),
    listConflicts: (...args: unknown[]) => listConflictsMock(...args),
  },
}));

const runMock = vi.fn();
vi.mock("@/features/sync/sync-service", () => ({
  syncService: { run: (...args: unknown[]) => runMock(...args) },
  PERIODIC_SYNC_MS: 5 * 60 * 1000,
}));

const isTauriAppMock = vi.fn(() => true);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriAppMock() }));

vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "profile-1",
}));

import { useSyncConflicts, useSyncStatus } from "../use-sync-status";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getStatusMock.mockReset().mockResolvedValue({
    deviceId: "device-1",
    cursor: 3,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    lastSyncedAt: null,
  });
  runMock.mockReset().mockResolvedValue({ pushed: 0, pulled: 0, conflicts: 0 });
  isTauriAppMock.mockReset().mockReturnValue(true);
  listConflictsMock.mockReset().mockResolvedValue([]);
});

describe("useSyncStatus", () => {
  it("reads the native sync status once resolved", async () => {
    const { result } = renderHook(() => useSyncStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      deviceId: "device-1",
      cursor: 3,
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: null,
    });
  });

  it("never calls the native status command outside Tauri", async () => {
    isTauriAppMock.mockReturnValue(false);
    renderHook(() => useSyncStatus(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getStatusMock).not.toHaveBeenCalled();
  });

  it("estimates minutes until the next periodic check from lastSyncedAt", async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    getStatusMock.mockResolvedValue({
      deviceId: "device-1",
      cursor: 3,
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: twoMinutesAgo,
    });

    const { result } = renderHook(() => useSyncStatus(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 5-minute interval minus the 2 already elapsed since lastSyncedAt.
    expect(result.current.nextCheckInMinutes).toBe(3);
  });

  it("has no next-check estimate before anything has ever synced", async () => {
    const { result } = renderHook(() => useSyncStatus(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.nextCheckInMinutes).toBeNull();
  });

  it("syncNow runs the shared sync engine, then refetches the status", async () => {
    const { result } = renderHook(() => useSyncStatus(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    getStatusMock.mockResolvedValue({ deviceId: "device-1", cursor: 4, pendingCount: 1, failedCount: 0 });

    await result.current.syncNow();

    expect(runMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.data?.cursor).toBe(4));
  });
});

describe("useSyncConflicts", () => {
  it("fetches conflict details only when enabled", async () => {
    const { rerender } = renderHook(({ enabled }) => useSyncConflicts(enabled), {
      wrapper: createWrapper(),
      initialProps: { enabled: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listConflictsMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(listConflictsMock).toHaveBeenCalledWith(20));
  });

  it("never calls the native command outside Tauri even when enabled", async () => {
    isTauriAppMock.mockReturnValue(false);
    renderHook(() => useSyncConflicts(true), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listConflictsMock).not.toHaveBeenCalled();
  });
});
