import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Module-level state (memoryState/listeners) — a fresh module instance per
// test avoids leakage between tests, same pattern as token-vault.test.ts.
async function importFresh() {
  vi.resetModules();
  return import("../use-toast");
}

describe("useToast / toast", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("starts with no toasts", async () => {
    const { useToast } = await importFresh();
    const { result } = renderHook(() => useToast());

    expect(result.current.toasts).toEqual([]);
  });

  it("adds a toast that subscribed hooks immediately see", async () => {
    const { useToast, toast } = await importFresh();
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ description: "Saved." });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.description).toBe("Saved.");
  });

  it("caps the visible list at 3, keeping the most recent first", async () => {
    const { useToast, toast } = await importFresh();
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ description: "one" });
      toast({ description: "two" });
      toast({ description: "three" });
      toast({ description: "four" });
    });

    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts.map((t) => t.description)).toEqual(["four", "three", "two"]);
  });

  it("dismiss() removes a specific toast by id", async () => {
    const { useToast, toast } = await importFresh();
    const { result } = renderHook(() => useToast());

    let id = "";
    act(() => {
      id = toast({ description: "goes away" }).id;
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("auto-dismisses after the timeout", async () => {
    vi.useFakeTimers();
    const { useToast, toast } = await importFresh();
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ description: "temporary" });
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});
