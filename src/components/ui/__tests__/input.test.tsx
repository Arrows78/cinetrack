import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Input } from "../input";

describe("Input", () => {
  it("renders and accepts typed input", () => {
    render(<Input placeholder="Search" />);

    const input = screen.getByPlaceholderText("Search");
    fireEvent.change(input, { target: { value: "batman" } });

    expect(input).toHaveValue("batman");
  });

  it("forwards the disabled prop", () => {
    render(<Input placeholder="Search" disabled />);
    expect(screen.getByPlaceholderText("Search")).toBeDisabled();
  });

  it("styles aria-invalid controls with the destructive token", () => {
    render(<Input placeholder="Year" aria-invalid="true" />);
    expect(screen.getByPlaceholderText("Year")).toHaveClass("aria-[invalid=true]:border-destructive");
  });

  it("calls onChange when the value changes", () => {
    const onChange = vi.fn();
    render(<Input placeholder="Search" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "a" } });
    expect(onChange).toHaveBeenCalled();
  });
});
