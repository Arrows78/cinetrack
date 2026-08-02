import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Panel } from "../panel";
import { Select } from "../select";
import { Separator } from "../separator";
import { Textarea } from "../textarea";
import { Tile } from "../tile";

describe("surface and form primitives", () => {
  it("renders Panel tones and supports asChild composition", () => {
    const { rerender } = render(<Panel>Card panel</Panel>);
    expect(screen.getByText("Card panel")).toHaveClass("bg-card/60");

    rerender(<Panel tone="subtle">Subtle panel</Panel>);
    expect(screen.getByText("Subtle panel")).toHaveClass("bg-foreground/[0.03]");

    rerender(
      <Panel asChild>
        <a href="/library">Library panel</a>
      </Panel>
    );
    expect(screen.getByRole("link", { name: "Library panel" })).toHaveAttribute("href", "/library");
  });

  it("renders Tile as a div or composed child", () => {
    const { rerender } = render(<Tile className="p-2">Tile content</Tile>);
    expect(screen.getByText("Tile content")).toHaveClass("rounded-xl", "p-2");

    rerender(
      <Tile asChild>
        <button type="button">Tile action</button>
      </Tile>
    );
    expect(screen.getByRole("button", { name: "Tile action" })).toHaveClass("border-border");
  });

  it("forwards refs and native change behavior for Select", () => {
    const ref = createRef<HTMLSelectElement>();
    const onChange = vi.fn();
    render(
      <Select ref={ref} aria-label="Media type" defaultValue="movie" onChange={onChange}>
        <option value="movie">Movie</option>
        <option value="series">Series</option>
      </Select>
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Media type" }), { target: { value: "series" } });
    expect(ref.current).toBe(screen.getByRole("combobox", { name: "Media type" }));
    expect(ref.current).toHaveValue("series");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("forwards refs and native input behavior for Textarea", () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    render(<Textarea ref={ref} aria-label="Notes" defaultValue="Initial" onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Updated" } });
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Notes" }));
    expect(ref.current).toHaveValue("Updated");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders horizontal and vertical separators", () => {
    const { container, rerender } = render(<Separator />);
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "horizontal");
    expect(container.firstElementChild).toHaveClass("h-px", "w-full");

    rerender(<Separator orientation="vertical" />);
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "vertical");
    expect(container.firstElementChild).toHaveClass("h-full", "w-px");
  });
});
