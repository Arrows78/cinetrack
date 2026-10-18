import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const initialize = vi.fn();
vi.mock("@/features/sync/sync-service", () => ({
  syncService: { initialize: (...args: unknown[]) => initialize(...args) },
}));
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
const loggerWarn = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { info: vi.fn(), warn: (...args: unknown[]) => loggerWarn(...args), error: vi.fn() },
}));

import { AuthContext, type AuthContextValue } from "@/features/auth/use-auth";
import { useCloudSync } from "../use-cloud-sync";

function wrapperFor(userId: string | null) {
  const client = new QueryClient();
  const value = { user: userId ? { id: userId } : null } as unknown as AuthContextValue;
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  initialize.mockReset();
  loggerWarn.mockReset();
});

describe("useCloudSync", () => {
  it("does not start sync while nobody is signed in", () => {
    renderHook(() => useCloudSync(), { wrapper: wrapperFor(null) });
    expect(initialize).not.toHaveBeenCalled();
  });

  it("starts sync when a user is signed in and stops it on unmount", async () => {
    const stop = vi.fn();
    initialize.mockResolvedValue(stop);
    const { unmount } = renderHook(() => useCloudSync(), { wrapper: wrapperFor("user_1") });
    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("starts sync after a late sign-in and tears it down on sign-out", async () => {
    const stop = vi.fn();
    initialize.mockResolvedValue(stop);
    let userId: string | null = null;
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={{ user: userId ? { id: userId } : null } as unknown as AuthContextValue}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    const { rerender } = renderHook(() => useCloudSync(), { wrapper });
    expect(initialize).not.toHaveBeenCalled();

    userId = "user_1";
    rerender();
    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    userId = null;
    rerender();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("disposes a run that resolves after sign-out", async () => {
    const stop = vi.fn();
    let resolve!: (value: () => void) => void;
    initialize.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useCloudSync(), { wrapper: wrapperFor("user_1") });
    unmount();
    resolve(stop);
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  });

  it("logs a failed initialization instead of swallowing it", async () => {
    initialize.mockRejectedValue(new Error("boom"));
    renderHook(() => useCloudSync(), { wrapper: wrapperFor("user_1") });
    await waitFor(() => expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining("boom")));
  });
});
