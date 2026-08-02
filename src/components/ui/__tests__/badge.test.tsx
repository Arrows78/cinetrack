import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("applies the default variant class when none is given", () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).toHaveClass("bg-primary/20");
  });

  it("applies the movie variant class", () => {
    render(<Badge variant="movie">Movie</Badge>);
    expect(screen.getByText("Movie")).toHaveClass("bg-primary/80", "text-primary-foreground");
  });

  it.each([
    ["success", "bg-success", "text-success-foreground"],
    ["warning", "bg-warning", "text-warning-foreground"],
    ["destructive", "bg-destructive", "text-destructive-foreground"],
  ] as const)("applies the %s semantic variant", (variant, backgroundClass, foregroundClass) => {
    render(<Badge variant={variant}>{variant}</Badge>);
    expect(screen.getByText(variant)).toHaveClass(backgroundClass, foregroundClass);
  });

  it("merges a custom className", () => {
    render(<Badge className="custom-class">Custom</Badge>);
    expect(screen.getByText("Custom")).toHaveClass("custom-class");
  });
});
