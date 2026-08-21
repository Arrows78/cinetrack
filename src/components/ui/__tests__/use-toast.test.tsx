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

  it("dismissing early clears the pending auto-removal timeout instead of leaving it scheduled", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { useToast, toast } = await importFresh();
    const { result } = renderHook(() => useToast());

    let id = "";
    act(() => {
      id = toast({ description: "goes away early" }).id;
    });
    expect(clearTimeoutSpy).not.toHaveBeenCalled();

    act(() => {
      result.current.dismiss(id);
    });
    // The dismiss() call found a pending timeout for this id (the `if
    // (timeout)` branch in dismiss()) and cleared it via clearTimeout.
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(result.current.toasts).toHaveLength(0);

    // Advancing time past TOAST_REMOVE_DELAY must not trigger a second
    // clearTimeout call or otherwise resurrect/corrupt state — the timer
    // was already cleared, so there is nothing left to fire.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(result.current.toasts).toHaveLength(0);

    vi.useRealTimers();
    clearTimeoutSpy.mockRestore();
  });

  it("dismissing an id twice is a no-op the second time (missing-timeout branch)", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { useToast, toast } = await importFresh();
    const { result } = renderHook(() => useToast());

    let id = "";
    act(() => {
      id = toast({ description: "goes away" }).id;
    });

    act(() => {
      result.current.dismiss(id);
    });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    // Second dismiss() for the same id: no pending timeout left in the map,
    // so it must not throw and must not call clearTimeout again.
    expect(() => {
      act(() => {
        result.current.dismiss(id);
      });
    }).not.toThrow();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(result.current.toasts).toHaveLength(0);

    vi.useRealTimers();
    clearTimeoutSpy.mockRestore();
  });

  it("unmounting a subscriber stops it from receiving further updates, and a later toast() call does not throw", async () => {
    const { useToast, toast } = await importFresh();
    const first = renderHook(() => useToast());
    const second = renderHook(() => useToast());

    act(() => {
      toast({ description: "before unmount" });
    });
    expect(first.result.current.toasts).toHaveLength(1);
    expect(second.result.current.toasts).toHaveLength(1);

    first.unmount();

    expect(() => {
      act(() => {
        toast({ description: "after unmount" });
      });
    }).not.toThrow();

    // The still-mounted subscriber keeps receiving updates...
    expect(second.result.current.toasts).toHaveLength(2);
    // ...while the unmounted one was removed from the listener set on
    // cleanup and no longer reflects new state.
    expect(first.result.current.toasts).toHaveLength(1);
  });
});
