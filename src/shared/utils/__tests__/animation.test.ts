import { describe, expect, it } from "vitest";
import { staggerDelayMs } from "../animation";

describe("staggerDelayMs", () => {
  it("scales linearly with the index by default", () => {
    expect(staggerDelayMs(0)).toBe(0);
    expect(staggerDelayMs(3)).toBe(300);
  });

  it("caps at the max delay", () => {
    expect(staggerDelayMs(100)).toBe(800);
  });

  it("honors a custom step and max", () => {
    expect(staggerDelayMs(2, 50, 1000)).toBe(100);
    expect(staggerDelayMs(50, 50, 1000)).toBe(1000);
  });
});
