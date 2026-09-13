import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionNav } from "../section-nav";

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("SectionNav", () => {
  it("renders nothing with fewer than two sections", () => {
    const { container } = render(<SectionNav items={[{ id: "solo", label: "Solo" }]} ariaLabel="Sections" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing with no sections", () => {
    const { container } = render(<SectionNav items={[]} ariaLabel="Sections" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a pill per section, linking to its anchor", () => {
    globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

    render(
      <SectionNav
        items={[
          { id: "alpha", label: "Alpha" },
          { id: "beta", label: "Beta" },
        ]}
        ariaLabel="Sections"
      />
    );

    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "#alpha");
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute("href", "#beta");
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("aria-current", "location");
  });
});
