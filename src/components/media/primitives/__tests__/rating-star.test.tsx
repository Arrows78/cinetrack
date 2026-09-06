import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { RatingStar } from "../rating-star";

describe("RatingStar", () => {
  it("renders the star glyph and the formatted rating as separate spans", () => {
    const { container } = render(<RatingStar rating={8.4} />);

    expect(screen.getByText("★")).toBeInTheDocument();
    expect(screen.getByText("8.4")).toBeInTheDocument();
    expect(container.querySelectorAll("span")).toHaveLength(2);
  });

  it("shows a dash for a missing rating, same as formatRating's own fallback", () => {
    render(<RatingStar rating={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("appends a suffix right after the formatted number", () => {
    render(<RatingStar rating={8} suffix="/10" />);

    expect(screen.getByText("8.0/10")).toBeInTheDocument();
  });

  it("defaults the star to text-rating and lets the caller override it", () => {
    const { container } = render(<RatingStar rating={7} />);
    expect(container.querySelector("span")).toHaveClass("text-rating");

    const { container: overridden } = render(<RatingStar rating={7} starClassName="" />);
    expect(overridden.querySelector("span")).not.toHaveClass("text-rating");
  });

  it("applies numberClassName only to the number span", () => {
    const { container } = render(<RatingStar rating={7} numberClassName="font-semibold text-foreground" />);
    const spans = container.querySelectorAll("span");

    expect(spans[0]).not.toHaveClass("font-semibold");
    expect(spans[1]).toHaveClass("font-semibold", "text-foreground");
  });
});
