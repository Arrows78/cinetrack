import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { ThemeController } from "@/components/layout/theme-controller";
import { defaultPreferences } from "@/features/preferences/preferences-repository";
import { usePreferences } from "@/features/preferences/use-preferences";
import { COLOR_PRESETS } from "@/shared/constants/colors";
import type { UserPreferences } from "@/types/media";

// "Restart" = a brand new QueryClient (the in-memory cache of the previous
// process is gone) over the same persisted store. `persisted` stands for the
// SQLite `preferences` table behind the Rust commands: it is the only thing
// that survives between two "processes" here, exactly like the real app. The
// Rust side of the same promise (file database closed and reopened) is proven
// in src-tauri/src/database/persistence_tests.rs.
let persisted: UserPreferences;
let readsFail = false;

const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  if (command === "get_preferences") {
    if (readsFail) throw new Error("database is locked");
    return structuredClone(persisted);
  }
  if (command === "update_preference") {
    persisted = { ...persisted, [args!.key as string]: args!.value };
    return structuredClone(persisted);
  }
  throw new Error(`Unhandled command: ${command}`);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

function newProcess() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

function writes() {
  return invokeMock.mock.calls.filter(([command]) => command !== "get_preferences");
}

describe("preferences across an application restart", () => {
  beforeEach(() => {
    persisted = structuredClone(defaultPreferences);
    readsFail = false;
    invokeMock.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.body.className = "";
    document.getElementById("cinetrack-accent-vars")?.remove();
  });

  it("reads back every value written before the restart, and applies it", async () => {
    const first = newProcess();
    const session = renderHook(() => usePreferences(), { wrapper: first.Wrapper });
    await waitFor(() => expect(session.result.current.isSuccess).toBe(true));
    await act(async () => {
      await session.result.current.updatePreference({ key: "theme", value: "light" });
      await session.result.current.updatePreference({ key: "accentColor", value: "teal" });
      await session.result.current.updatePreference({ key: "language", value: "fr" });
      await session.result.current.updatePreference({ key: "region", value: "BE" });
      await session.result.current.updatePreference({ key: "reduceMotion", value: true });
      await session.result.current.updatePreference({ key: "recentSearches", value: ["dune", "alien"] });
    });
    session.unmount();
    first.client.clear();

    const second = newProcess();
    const restarted = renderHook(() => usePreferences(), { wrapper: second.Wrapper });
    await waitFor(() => expect(restarted.result.current.isSuccess).toBe(true));
    expect(restarted.result.current.data).toMatchObject({
      theme: "light",
      accentColor: "teal",
      language: "fr",
      region: "BE",
      reduceMotion: true,
      recentSearches: ["dune", "alien"],
      // Untouched values keep their defaults rather than being reset.
      sidebarCollapsed: false,
      backupFrequency: "daily",
    });

    render(<ThemeController />, { wrapper: second.Wrapper });
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    expect(document.getElementById("cinetrack-accent-vars")?.textContent).toContain(COLOR_PRESETS.teal.light);
  });

  it("a failed read after the restart writes nothing and resets nothing", async () => {
    persisted = { ...persisted, theme: "light", accentColor: "rose", region: "CA" };
    const before = structuredClone(persisted);
    readsFail = true;

    const { client, Wrapper } = newProcess();
    const session = renderHook(() => usePreferences(), { wrapper: Wrapper });
    render(<ThemeController />, { wrapper: Wrapper });
    await waitFor(() => expect(session.result.current.isError).toBe(true));

    // The read failed: no write (no "reset to defaults") was issued, and the
    // stored values are exactly what they were.
    expect(writes()).toEqual([]);
    expect(persisted).toEqual(before);

    // The database comes back: the very same values are read, not the defaults.
    readsFail = false;
    await act(async () => {
      await client.refetchQueries({ queryKey: ["local", "preferences"] });
    });
    await waitFor(() => expect(session.result.current.isSuccess).toBe(true));
    expect(session.result.current.data).toMatchObject({ theme: "light", accentColor: "rose", region: "CA" });
    expect(writes()).toEqual([]);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("a failed write is reported and leaves the stored values alone", async () => {
    persisted = { ...persisted, theme: "light" };
    const { Wrapper } = newProcess();
    const session = renderHook(() => usePreferences(), { wrapper: Wrapper });
    await waitFor(() => expect(session.result.current.isSuccess).toBe(true));

    invokeMock.mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    await act(async () => {
      await expect(session.result.current.updatePreference({ key: "theme", value: "dark" })).rejects.toThrow(
        "disk full"
      );
    });

    expect(persisted.theme).toBe("light");
    expect(session.result.current.data?.theme).toBe("light");
  });
});
