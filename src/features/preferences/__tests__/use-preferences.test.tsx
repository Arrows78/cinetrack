import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useTestSqlite } from "@/db/__tests__/sqlite-test-harness";

vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => true }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("usePreferences", () => {
  useTestSqlite();

  it("loads default preferences", async () => {
    const { usePreferences } = await import("../use-preferences");
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.theme).toBe("dark");
    expect(result.current.data?.language).toBe("en");
  });

  it("persists and reflects an updated preference", async () => {
    const { usePreferences } = await import("../use-preferences");
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreference({ key: "theme", value: "light" });
    });

    await waitFor(() => expect(result.current.data?.theme).toBe("light"));
  });
});
