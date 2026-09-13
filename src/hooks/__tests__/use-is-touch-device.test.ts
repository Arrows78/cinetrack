import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsTouchDevice } from "../use-is-touch-device";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  mockMatchMedia(false);
});

describe("useIsTouchDevice", () => {
  it("returns false when the pointer is fine (mouse/trackpad)", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);
  });

  it("returns true when the pointer is coarse (touch)", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(true);
  });
});
