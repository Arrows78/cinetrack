import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeywordChips } from "../keyword-chips";

describe("KeywordChips", () => {
  it("renders nothing without keywords", () => {
    const { container } = render(<KeywordChips />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing with an empty keywords array", () => {
    const { container } = render(<KeywordChips keywords={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one chip per keyword", () => {
    render(<KeywordChips keywords={["time travel", "based on video game"]} />);
    expect(screen.getByText("time travel")).toBeInTheDocument();
    expect(screen.getByText("based on video game")).toBeInTheDocument();
  });
});
