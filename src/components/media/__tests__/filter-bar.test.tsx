import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FilterBar } from "../filter-bar";

const options = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "series", label: "Series" },
] as const;

describe("FilterBar", () => {
  it("marks the current value and emits a selected option", () => {
    const onChange = vi.fn();
    render(<FilterBar value="all" options={[...options]} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "All" })).toHaveClass("text-foreground");
    expect(screen.getByRole("button", { name: "Movies" })).toHaveClass("text-muted-foreground");

    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    expect(onChange).toHaveBeenCalledWith("series");
  });
});
