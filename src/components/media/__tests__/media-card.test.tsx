import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { MediaCard } from "../media-card";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

describe("MediaCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the title, year, first genre and rating", () => {
    render(<MediaCard media={makeMedia({ title: "Dune", year: 2021, rating: 8.05, genres: ["Sci-Fi", "Drama"] })} />);

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    expect(screen.getByText("8.1")).toBeInTheDocument();
  });

  it("links movies and series to their own detail routes", () => {
    const { rerender } = render(<MediaCard media={makeMedia({ id: 42, mediaType: "movie" })} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/movies/$movieId");

    rerender(<MediaCard media={makeMedia({ id: 42, mediaType: "series" })} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/series/$seriesId");
  });

  it("falls back to the placeholder poster and unknown year", () => {
    render(<MediaCard media={makeMedia({ posterPath: null, year: null })} />);

    // Vite inlines the placeholder SVG as a data: URI; the real point is
    // that the src is not a TMDB URL.
    expect(screen.getByRole("img")).not.toHaveAttribute("src", expect.stringContaining("image.tmdb.org"));
    expect(screen.getByText("Unknown year")).toBeInTheDocument();
  });
});
