import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { EpisodeRatingControl } from "../episode-rating-control";

describe("EpisodeRatingControl", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders five rating options, each labeled with a real word", () => {
    render(<EpisodeRatingControl rating={null} onRate={vi.fn()} />);

    for (const label of ["Terrible", "Bad", "Okay", "Good", "Great"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the current rating as pressed, and no other option", () => {
    render(<EpisodeRatingControl rating={4} onRate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bad" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onRate with the clicked value", () => {
    const onRate = vi.fn();
    render(<EpisodeRatingControl rating={null} onRate={onRate} />);

    fireEvent.click(screen.getByRole("button", { name: "Great" }));
    expect(onRate).toHaveBeenCalledWith(5);
  });

  it("clicking the already-selected option clears the rating (calls onRate with null)", () => {
    const onRate = vi.fn();
    render(<EpisodeRatingControl rating={3} onRate={onRate} />);

    fireEvent.click(screen.getByRole("button", { name: "Okay" }));
    expect(onRate).toHaveBeenCalledWith(null);
  });

  it("disables every option when disabled is true", () => {
    render(<EpisodeRatingControl rating={null} onRate={vi.fn()} disabled />);

    for (const label of ["Terrible", "Bad", "Okay", "Good", "Great"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });
});
