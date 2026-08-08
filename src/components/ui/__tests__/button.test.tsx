import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("disables and marks itself busy while isLoading", () => {
    render(<Button isLoading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("does not mark itself busy by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-busy");
  });

  it("stays disabled while isLoading even if disabled is explicitly false", () => {
    render(
      <Button isLoading disabled={false}>
        Save
      </Button>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("renders asChild without injecting a loading spinner", () => {
    render(
      <Button asChild isLoading>
        <a href="/settings">Go</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Go" });
    expect(link.tagName).toBe("A");
  });
});
