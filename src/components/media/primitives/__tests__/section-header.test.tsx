import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "../section-header";

describe("SectionHeader", () => {
  it("renders an <h2> at text-heading-lg by default", () => {
    render(<SectionHeader title="A section" />);
    const heading = screen.getByRole("heading", { level: 2, name: "A section" });
    expect(heading.className).toContain("text-heading-lg");
  });

  it("renders an <h1> at text-page-title when isPageTitle is set — the same size every page's own hand-rolled <h1> uses", () => {
    render(<SectionHeader title="A page" isPageTitle />);
    const heading = screen.getByRole("heading", { level: 1, name: "A page" });
    expect(heading.className).toContain("text-page-title");
    expect(heading.className).not.toContain("text-heading-lg");
  });

  it("renders a smaller <h3> at text-heading-sm for a nested (sub) section", () => {
    render(<SectionHeader title="A subsection" size="sub" />);
    const heading = screen.getByRole("heading", { level: 3, name: "A subsection" });
    expect(heading.className).toContain("text-heading-sm");
  });

  it("lets headingLevel override the tag independently of the visual size", () => {
    render(<SectionHeader title="Overridden level" isPageTitle headingLevel={2} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Overridden level" });
    expect(heading.className).toContain("text-page-title");
  });
});
