import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const getStatusMock = vi.fn();
vi.mock("@/features/sync/sync-repository", () => ({
  syncRepository: { getStatus: (...args: unknown[]) => getStatusMock(...args) },
}));

const runMock = vi.fn();
vi.mock("@/features/sync/sync-service", () => ({
  syncService: { run: (...args: unknown[]) => runMock(...args) },
}));

const isTauriAppMock = vi.fn(() => true);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriAppMock() }));

vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "profile-1",
}));

import { useSyncStatus } from "../use-sync-status";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getStatusMock.mockReset().mockResolvedValue({ deviceId: "device-1", cursor: 3, pendingCount: 0, failedCount: 0 });
  runMock.mockReset().mockResolvedValue({ pushed: 0, pulled: 0, conflicts: 0 });
  isTauriAppMock.mockReset().mockReturnValue(true);
});

describe("useSyncStatus", () => {
  it("reads the native sync status once resolved", async () => {
    const { result } = renderHook(() => useSyncStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ deviceId: "device-1", cursor: 3, pendingCount: 0, failedCount: 0 });
  });

  it("never calls the native status command outside Tauri", async () => {
    isTauriAppMock.mockReturnValue(false);
    renderHook(() => useSyncStatus(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getStatusMock).not.toHaveBeenCalled();
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
