import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { usePreferences } from "../use-preferences";
import { preferencesRepository } from "../preferences-repository";

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("usePreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preferencesRepository.invalidate();
  });

  it("loads default preferences", async () => {
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.theme).toBe("dark");
    expect(result.current.data?.language).toBe("en");
  });

  it("persists and reflects an updated preference", async () => {
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreference({ key: "theme", value: "light" });
    });

    await waitFor(() => expect(result.current.data?.theme).toBe("light"));
  });
});
