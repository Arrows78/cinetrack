import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { GridSkeleton, HeroSkeleton, TimelineSkeleton, TrackedSeriesSkeleton } from "../loading-skeletons";

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

    expect(container.firstElementChild).toHaveAttribute("role", "status");
    expect(container.querySelector(".rounded-hero")).toHaveClass("h-[28.75rem]", "rounded-hero");
  });

  it("renders the requested number of timeline rows", () => {
    const { container } = render(<TimelineSkeleton count={3} />);

    // 3 skeleton blocks per row: the icon-dot, the title line, the date line.
    expect(container.querySelectorAll(".animate-shimmer")).toHaveLength(3 * 3);
  });

  it("defaults to six timeline rows", () => {
    const { container } = render(<TimelineSkeleton />);

    expect(container.querySelectorAll(".animate-shimmer")).toHaveLength(6 * 3);
  });

  it("renders the requested number of tracked-series rows", () => {
    const { container } = render(<TrackedSeriesSkeleton count={2} />);

    // 4 skeleton blocks per row: title, subtitle, percentage badge, progress bar.
    expect(container.querySelectorAll(".animate-shimmer")).toHaveLength(2 * 4);
  });

  it("defaults to four tracked-series rows", () => {
    const { container } = render(<TrackedSeriesSkeleton />);

    expect(container.querySelectorAll(".animate-shimmer")).toHaveLength(4 * 4);
  });
});
