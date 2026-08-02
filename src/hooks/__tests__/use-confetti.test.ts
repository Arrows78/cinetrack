import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const confettiMock = vi.fn();

vi.mock("canvas-confetti", () => ({
  default: (...args: unknown[]) => confettiMock(...args),
}));

describe("useConfetti", () => {
  beforeEach(() => {
    confettiMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("burst fires a single centered confetti call by default", async () => {
    const { useConfetti } = await import("../use-confetti");
    const { result } = renderHook(() => useConfetti());

    result.current.burst();

    expect(confettiMock).toHaveBeenCalledTimes(1);
    expect(confettiMock).toHaveBeenCalledWith(expect.objectContaining({ origin: { x: 0.5, y: 0.6 } }));
  });

  it("celebrate fires two immediate bursts and a delayed third one", async () => {
    const { useConfetti } = await import("../use-confetti");
    const { result } = renderHook(() => useConfetti());

    result.current.celebrate();

    expect(confettiMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(150);

    expect(confettiMock).toHaveBeenCalledTimes(3);
  });

  it("burstFromRef falls back to a centered burst when there is no element", async () => {
    const { useConfetti } = await import("../use-confetti");
    const { result } = renderHook(() => useConfetti());

    result.current.burstFromRef(null);

    expect(confettiMock).toHaveBeenCalledWith(expect.objectContaining({ origin: { x: 0.5, y: 0.6 } }));
  });

  it("burstFromRef derives the origin from the element's bounding box", async () => {
    const { useConfetti } = await import("../use-confetti");
    const { result } = renderHook(() => useConfetti());

    const el = document.createElement("div");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 20,
      height: 10,
      right: 120,
      bottom: 60,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, "innerWidth", { value: 200, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 100, configurable: true });

    result.current.burstFromRef(el);

    expect(confettiMock).toHaveBeenCalledWith(expect.objectContaining({ origin: { x: 0.55, y: 0.55 } }));
  });
});
