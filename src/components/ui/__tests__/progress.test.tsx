import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Progress } from "../progress";

describe("Progress", () => {
  it("translates the indicator based on the value", () => {
    const { container } = render(<Progress value={40} />);
    const indicator = container.querySelector('[class*="bg-primary"]') as HTMLElement;

    expect(indicator.style.transform).toBe("translateX(-60%)");
  });

  it("defaults the value to 0 when not provided", () => {
    const { container } = render(<Progress />);
    const indicator = container.querySelector('[class*="bg-primary"]') as HTMLElement;

    expect(indicator.style.transform).toBe("translateX(-100%)");
  });

  it("merges a custom indicator className", () => {
    const { container } = render(<Progress value={50} indicatorClassName="custom-indicator" />);
    expect(container.querySelector(".custom-indicator")).toBeInTheDocument();
  });
});
