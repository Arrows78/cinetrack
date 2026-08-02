import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
  it("renders a shimmer placeholder with the given className", () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    const root = container.firstChild as HTMLElement;

    expect(root).toHaveClass("h-4", "w-full", "rounded-2xl");
  });

  it("renders without a className", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
