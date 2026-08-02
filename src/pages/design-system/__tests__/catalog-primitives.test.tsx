import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ComponentSpec, CoverageBadge } from "../catalog-primitives";

describe("design-system catalog primitives", () => {
  it.each([
    ["live", "Live showcase"],
    ["reference", "API reference"],
    ["internal", "Internal"],
  ] as const)("renders the %s coverage badge", (coverage, label) => {
    render(<CoverageBadge coverage={coverage} />);

    expect(screen.getByText(label)).toHaveAttribute("data-coverage", coverage);
  });

  it("renders the complete component contract", () => {
    render(
      <ComponentSpec
        name="Example control"
        source="components/ui/example.tsx"
        description="A representative component."
        anatomy={["container", "label"]}
        variants={["default", "quiet"]}
        states={["enabled", "disabled"]}
        guidance="A repeatable action needs a shared contract."
        accessibility="Expose an accessible name and visible focus state."
      >
        <button type="button">Example action</button>
      </ComponentSpec>
    );

    expect(screen.getByRole("heading", { name: "Example control" })).toBeInTheDocument();
    expect(screen.getByText("components/ui/example.tsx")).toBeInTheDocument();
    expect(screen.getByText("container")).toBeInTheDocument();
    expect(screen.getByText("quiet")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByText("A repeatable action needs a shared contract.")).toBeInTheDocument();
    expect(screen.getByText("Expose an accessible name and visible focus state.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Example action" })).toBeInTheDocument();
  });

  it("omits the metadata panel when no metadata is supplied", () => {
    render(
      <ComponentSpec name="Minimal" source="minimal.tsx" description="Minimal contract.">
        <span>Preview</span>
      </ComponentSpec>
    );

    expect(screen.queryByText("Anatomy")).not.toBeInTheDocument();
    expect(screen.queryByText("Accessibility")).not.toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });
});
