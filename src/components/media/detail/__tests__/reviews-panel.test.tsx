import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { MediaReview } from "@/types/media";
import { ReviewsPanel } from "../reviews-panel";

function buildReview(overrides: Partial<MediaReview> = {}): MediaReview {
  return {
    id: "r1",
    author: "Jane Critic",
    avatarUrl: "https://image.tmdb.org/t/p/w92/avatar.jpg",
    rating: 8,
    content: "A remarkable achievement in filmmaking.",
    createdAt: "2024-01-01T00:00:00.000Z",
    url: "https://www.themoviedb.org/review/abc123",
    ...overrides,
  };
}

describe("ReviewsPanel", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing without reviews", () => {
    const { container } = render(<ReviewsPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing with an empty reviews array", () => {
    const { container } = render(<ReviewsPanel reviews={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the author, rating, content, and a link to the full review", () => {
    render(<ReviewsPanel reviews={[buildReview()]} />);

    expect(screen.getByText("Jane Critic")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
    expect(screen.getByText("A remarkable achievement in filmmaking.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read full review/ })).toHaveAttribute(
      "href",
      "https://www.themoviedb.org/review/abc123"
    );
  });

  it("omits the rating badge when the reviewer left none", () => {
    render(<ReviewsPanel reviews={[buildReview({ rating: null })]} />);
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
  });

  it("renders one card per review", () => {
    render(<ReviewsPanel reviews={[buildReview({ id: "r1" }), buildReview({ id: "r2", author: "Second Critic" })]} />);

    expect(screen.getByText("Jane Critic")).toBeInTheDocument();
    expect(screen.getByText("Second Critic")).toBeInTheDocument();
  });
});
