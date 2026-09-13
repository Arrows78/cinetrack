import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AmbientMotionController } from "../ambient-motion-controller";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  document.body.className = "";
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

describe("AmbientMotionController", () => {
  it("does not mark the tab hidden on mount when the document is visible", () => {
    render(<AmbientMotionController />);
    expect(document.body.classList.contains("tab-hidden")).toBe(false);
  });

  it("adds tab-hidden when the tab is backgrounded and removes it when it returns", () => {
    render(<AmbientMotionController />);

    setHidden(true);
    expect(document.body.classList.contains("tab-hidden")).toBe(true);

    setHidden(false);
    expect(document.body.classList.contains("tab-hidden")).toBe(false);
  });
});
