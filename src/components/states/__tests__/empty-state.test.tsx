import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(<EmptyState title="Nothing here" description="Add something to get started." />);

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Add something to get started.")).toBeInTheDocument();
  });

  it("does not render an icon when none is provided", () => {
    const { container } = render(<EmptyState title="Nothing here" description="..." />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders the provided icon", () => {
    const { container } = render(<EmptyState title="Nothing here" description="..." icon={Sparkles} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the action node when provided", () => {
    render(<EmptyState title="Nothing here" description="..." action={<button type="button">Retry</button>} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
