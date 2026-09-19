import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StarRating } from "../star-rating";

describe("StarRating", () => {
  it("reports its current value via aria-valuenow/aria-valuetext", () => {
    render(<StarRating value={7} onChange={vi.fn()} ariaLabel="Rating" noneLabel="Not rated" />);

    const slider = screen.getByRole("slider", { name: "Rating" });
    expect(slider).toHaveAttribute("aria-valuenow", "7");
    expect(slider).toHaveAttribute("aria-valuetext", "7/10");
  });

  it("announces the none label and a valuenow of 0 when nothing is rated", () => {
    render(<StarRating value={null} onChange={vi.fn()} ariaLabel="Rating" noneLabel="Not rated" />);

    const slider = screen.getByRole("slider", { name: "Rating" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(slider).toHaveAttribute("aria-valuetext", "Not rated");
  });

  it("steps by one point per arrow key press, clamped to 0..10", () => {
    const onChange = vi.fn();
    render(<StarRating value={9} onChange={onChange} ariaLabel="Rating" noneLabel="Not rated" />);
    const slider = screen.getByRole("slider", { name: "Rating" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(10);

    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(8);
  });

  it("jumps to the bounds on Home/End", () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} ariaLabel="Rating" noneLabel="Not rated" />);
    const slider = screen.getByRole("slider", { name: "Rating" });

    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(10);

    fireEvent.keyDown(slider, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("ignores keyboard input while disabled", () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} disabled ariaLabel="Rating" noneLabel="Not rated" />);
    const slider = screen.getByRole("slider", { name: "Rating" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-disabled", "true");
  });

  it("clears the rating when clicking the half already selected", () => {
    const onChange = vi.fn();
    render(<StarRating value={1} onChange={onChange} ariaLabel="Rating" noneLabel="Not rated" />);

    // The first star's left half is the "1" (half-star) click zone.
    const [firstHalfButton] = screen.getAllByRole("button", { hidden: true });
    fireEvent.click(firstHalfButton!);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
