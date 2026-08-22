import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { queryKeys } from "@/shared/constants/query-keys";
import type { UserPreferences } from "@/types/media";

const defaultPreferences: UserPreferences = {
  theme: "dark",
  accentColor: "violet",
  language: "en",
  region: "FR",
  defaultSearchType: "all",
  reduceMotion: false,
  compactMode: false,
  sidebarCollapsed: false,
  libraryViewMode: "grid",
  spoilerProtection: true,
  notificationsEnabled: false,
  notifyHoursBefore: 24,
  preferredProviderIds: [],
  activeProfileId: DEFAULT_PROFILE_ID,
  backupDirectory: null,
  hideWatchedInDiscovery: false,
  onThisDayEnabled: false,
  userProfile: { id: DEFAULT_PROFILE_ID, name: null },
};

let stored: UserPreferences;

// Fakes the Rust `get_preferences`/`update_preference` commands (see
// src-tauri/src/commands/preferences.rs) at the invoke() boundary — the real
// SQL/business logic behind them is exercised by that module's own Rust
// tests, this only verifies the hook wires up to invoke() correctly.
const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (command === "get_preferences") return stored;
  if (command === "update_preference") {
    stored = { ...stored, [args!.key as string]: args!.value };
    return stored;
  }
  if (command === "refresh_preferences") return undefined;
  throw new Error(`Unhandled command: ${command}`);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// Same as createWrapper but also hands back the QueryClient instance, so
// tests below can spy on invalidateQueries.
function createWrapperWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    Wrapper: function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    },
  };
}

describe("usePreferences", () => {
  beforeEach(() => {
    stored = { ...defaultPreferences, userProfile: { ...defaultPreferences.userProfile } };
    invokeMock.mockClear();
  });

  it("loads default preferences", async () => {
    const { usePreferences } = await import("../use-preferences");
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.theme).toBe("dark");
    expect(result.current.data?.language).toBe("en");
    expect(invokeMock).toHaveBeenCalledWith("get_preferences", undefined);
  });

  it("persists and reflects an updated preference", async () => {
    const { usePreferences } = await import("../use-preferences");
    const { result } = renderHook(() => usePreferences(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreference({ key: "theme", value: "light" });
    });

    await waitFor(() => expect(result.current.data?.theme).toBe("light"));
    expect(invokeMock).toHaveBeenCalledWith("update_preference", { key: "theme", value: "light" });
  });
});

describe("usePreferences mutation side effects", () => {
  beforeEach(() => {
    stored = { ...defaultPreferences, userProfile: { ...defaultPreferences.userProfile } };
    invokeMock.mockClear();
  });

  it("invalidates remote, calendar and tracking queries when the changed key is 'language'", async () => {
    const { usePreferences } = await import("../use-preferences");
    const { client, Wrapper } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => usePreferences(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreference({ key: "language", value: "fr" });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(["remote"]);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.calendar(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.tracking(DEFAULT_PROFILE_ID));
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it("invalidates remote, calendar and tracking queries when the changed key is 'region'", async () => {
    const { usePreferences } = await import("../use-preferences");
    const { client, Wrapper } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => usePreferences(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreference({ key: "region", value: "US" });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(["remote"]);
    expect(invalidatedKeys).toContainEqual(queryKeys.local.calendar(DEFAULT_PROFILE_ID));
    expect(invalidatedKeys).toContainEqual(queryKeys.local.tracking(DEFAULT_PROFILE_ID));
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it("does not invalidate remote/calendar/tracking queries for an unrelated key like 'theme'", async () => {
    const { usePreferences } = await import("../use-preferences");
    const { client, Wrapper } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => usePreferences(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreference({ key: "theme", value: "light" });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useActiveProfileId", () => {
  beforeEach(() => {
    stored = { ...defaultPreferences, userProfile: { ...defaultPreferences.userProfile } };
    invokeMock.mockClear();
  });

  it("resolves to the stored activeProfileId once preferences load", async () => {
    stored = { ...stored, activeProfileId: "alex" };
    const { useActiveProfileId } = await import("../use-preferences");
    const { result } = renderHook(() => useActiveProfileId(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe("alex"));
  });

  it(`falls back to ${DEFAULT_PROFILE_ID} before preferences resolve`, async () => {
    const { useActiveProfileId } = await import("../use-preferences");
    const { result } = renderHook(() => useActiveProfileId(), { wrapper: createWrapper() });

    expect(result.current).toBe(DEFAULT_PROFILE_ID);
  });
});
