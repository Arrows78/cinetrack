import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  describe("clicking a pill", () => {
    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("scrolls the target section into view instead of letting the router treat it as a navigation", () => {
      globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
      const target = document.createElement("section");
      target.id = "beta";
      document.body.appendChild(target);
      const scrollIntoView = vi.fn();
      target.scrollIntoView = scrollIntoView;

      render(
        <SectionNav
          items={[
            { id: "alpha", label: "Alpha" },
            { id: "beta", label: "Beta" },
          ]}
          ariaLabel="Sections"
        />
      );

      const event = fireEvent.click(screen.getByRole("link", { name: "Beta" }));

      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
      // fireEvent.click returns false when the event's default was prevented.
      expect(event).toBe(false);
    });

    it("leaves a modified click (e.g. open-in-new-tab) alone", () => {
      globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
      const target = document.createElement("section");
      target.id = "beta";
      document.body.appendChild(target);
      const scrollIntoView = vi.fn();
      target.scrollIntoView = scrollIntoView;

      render(
        <SectionNav
          items={[
            { id: "alpha", label: "Alpha" },
            { id: "beta", label: "Beta" },
          ]}
          ariaLabel="Sections"
        />
      );

      fireEvent.click(screen.getByRole("link", { name: "Beta" }), { ctrlKey: true });

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("does nothing when the target section isn't present in the DOM", () => {
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

      expect(() => fireEvent.click(screen.getByRole("link", { name: "Beta" }))).not.toThrow();
    });
  });
});
