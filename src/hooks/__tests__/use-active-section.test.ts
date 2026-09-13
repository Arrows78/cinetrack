import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveSection } from "../use-active-section";

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;
type MockEntry = { isIntersecting: boolean; boundingClientRect: { top: number }; target: Element | null };

function mockEntries(entries: MockEntry[]): IntersectionObserverEntry[] {
  return entries as unknown as IntersectionObserverEntry[];
}

describe("useActiveSection", () => {
  let observeSpy: ReturnType<typeof vi.fn>;
  let disconnectSpy: ReturnType<typeof vi.fn>;
  let capturedCallback: ObserverCallback | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="alpha"></div><div id="beta"></div>';
    observeSpy = vi.fn();
    disconnectSpy = vi.fn();

    class MockIntersectionObserver {
      constructor(callback: ObserverCallback) {
        capturedCallback = callback;
      }
      observe = observeSpy;
      disconnect = disconnectSpy;
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    capturedCallback = undefined;
  });

  it("defaults to the first section id", () => {
    const { result } = renderHook(() => useActiveSection(["alpha", "beta"]));
    expect(result.current).toBe("alpha");
  });

  it("observes only the section ids present in the DOM", () => {
    renderHook(() => useActiveSection(["alpha", "missing", "beta"]));
    expect(observeSpy).toHaveBeenCalledTimes(2);
  });

  it("switches to the topmost intersecting section", () => {
    const { result } = renderHook(() => useActiveSection(["alpha", "beta"]));

    capturedCallback?.(
      mockEntries([
        { isIntersecting: true, boundingClientRect: { top: 100 }, target: document.getElementById("beta") },
        { isIntersecting: true, boundingClientRect: { top: 10 }, target: document.getElementById("alpha") },
      ])
    );

    expect(result.current).toBe("alpha");
  });

  it("ignores entries that aren't currently intersecting", () => {
    const { result } = renderHook(() => useActiveSection(["alpha", "beta"]));

    capturedCallback?.(
      mockEntries([{ isIntersecting: false, boundingClientRect: { top: 0 }, target: document.getElementById("alpha") }])
    );

    expect(result.current).toBe("alpha");
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = renderHook(() => useActiveSection(["alpha", "beta"]));
    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
