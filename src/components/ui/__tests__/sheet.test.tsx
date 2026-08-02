import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetSide,
  type SheetSize,
} from "../sheet";

function SheetExample({ side = "left", size = "sm" }: { side?: SheetSide; size?: SheetSize }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button">Open panel</button>
      </SheetTrigger>
      <SheetContent side={side} size={size} closeLabel="Dismiss panel">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine the current media list.</SheetDescription>
        </SheetHeader>
        <div>Panel content</div>
        <SheetFooter>
          <SheetClose asChild>
            <button type="button">Apply filters</button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("opens with an accessible title and description, then closes from the built-in control", async () => {
    render(<SheetExample />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel" }));

    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveAttribute("data-side", "left");
    expect(dialog).toHaveAttribute("data-size", "sm");
    expect(screen.getByText("Refine the current media list.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss panel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument());
  });

  it("closes through a composed SheetClose action", async () => {
    render(<SheetExample side="right" size="lg" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel" }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveAttribute("data-side", "right");
    expect(dialog).toHaveAttribute("data-size", "lg");

    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument());
  });

  it.each([
    ["left", "sm"],
    ["right", "md"],
    ["top", "lg"],
    ["bottom", "xl"],
  ] as const)("supports side=%s and size=%s", async (side, size) => {
    render(<SheetExample side={side} size={size} />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel" }));

    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveAttribute("data-side", side);
    expect(dialog).toHaveAttribute("data-size", size);
    expect(dialog.className).toContain(side === "left" || side === "right" ? "h-full" : "w-full");
  });
});
