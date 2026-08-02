import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { GridSkeleton, HeroSkeleton } from "../loading-skeletons";

describe("loading skeleton compositions", () => {
  it("renders the requested number of grid placeholders", () => {
    const { container } = render(<GridSkeleton count={4} />);

    expect(container.querySelectorAll(".animate-shimmer")).toHaveLength(4);
  });

  it("defaults to ten grid placeholders", () => {
    const { container } = render(<GridSkeleton />);

    expect(container.querySelectorAll(".animate-shimmer")).toHaveLength(10);
  });

  it("renders the hero geometry", () => {
    const { container } = render(<HeroSkeleton />);

    expect(container.firstElementChild).toHaveClass("h-[460px]", "rounded-hero");
  });
});
