import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import type { Episode } from "@/types/media";
import { EpisodeCard } from "../episode-card";
import { MediaDetailsHero } from "../media-details-hero";

let preferencesData: { spoilerProtection?: boolean } = {};
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: preferencesData }),
}));

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    seasonNumber: 1,
    episodeNumber: 3,
    title: "The Long Way Down",
    overview: "",
    airDate: "2024-03-01",
    stillPath: "/still.jpg",
    watched: false,
    ...overrides,
  };
}

describe("EpisodeCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("hides the still and title behind a spoiler placeholder when unwatched with spoiler protection on", () => {
    preferencesData = { spoilerProtection: true };
    const { container } = render(<EpisodeCard episode={makeEpisode()} onToggleSeen={vi.fn()} />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("Hidden title")).toBeInTheDocument();
    expect(screen.queryByText("The Long Way Down")).not.toBeInTheDocument();
  });

  it("shows the real still and title when spoiler protection is off", () => {
    preferencesData = { spoilerProtection: false };
    const { container } = render(<EpisodeCard episode={makeEpisode()} onToggleSeen={vi.fn()} />);

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "https://image.tmdb.org/t/p/w342/still.jpg");
    expect(screen.getByText("The Long Way Down")).toBeInTheDocument();
  });

  it("falls back to the placeholder image when stillPath is null", () => {
    preferencesData = { spoilerProtection: false };
    const { container } = render(<EpisodeCard episode={makeEpisode({ stillPath: null })} onToggleSeen={vi.fn()} />);

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", expect.stringContaining("placehold.co"));
    expect(image).not.toHaveAttribute("src", expect.stringContaining("image.tmdb.org"));
  });

  it("shows the real still and title even with spoiler protection on once the episode is watched", () => {
    preferencesData = { spoilerProtection: true };
    const { container } = render(<EpisodeCard episode={makeEpisode({ watched: true })} onToggleSeen={vi.fn()} />);

    expect(container.querySelector("img")).toHaveAttribute("src", "https://image.tmdb.org/t/p/w342/still.jpg");
    expect(screen.getByText("The Long Way Down")).toBeInTheDocument();
  });

  it("shows a seen badge and a filled check overlay on the still when watched", () => {
    preferencesData = { spoilerProtection: false };
    const { container } = render(<EpisodeCard episode={makeEpisode({ watched: true })} onToggleSeen={vi.fn()} />);

    expect(screen.getByText("Watched")).toBeInTheDocument();
    // Two checks: the overlay icon over the still, and the one inside the mark-seen button.
    expect(container.querySelectorAll("svg.lucide-check")).toHaveLength(2);
  });

  it("shows a last-unwatched badge instead of the seen badge when unwatched and flagged last", () => {
    preferencesData = { spoilerProtection: false };
    render(<EpisodeCard episode={makeEpisode({ watched: false })} onToggleSeen={vi.fn()} isLastUnwatched />);

    expect(screen.getByText("Last one!")).toBeInTheDocument();
    expect(screen.queryByText("Watched")).not.toBeInTheDocument();
  });

  it("renders the runtime only when present", () => {
    preferencesData = { spoilerProtection: false };
    const { rerender } = render(<EpisodeCard episode={makeEpisode({ runtime: 42 })} onToggleSeen={vi.fn()} />);
    expect(screen.getByText("42 min")).toBeInTheDocument();

    rerender(<EpisodeCard episode={makeEpisode({ runtime: undefined })} onToggleSeen={vi.fn()} />);
    expect(screen.queryByText("42 min")).not.toBeInTheDocument();
  });

  it("renders the rating only when present, and hides it while spoiler-hidden", () => {
    preferencesData = { spoilerProtection: false };
    const { rerender } = render(<EpisodeCard episode={makeEpisode({ rating: 8.4 })} onToggleSeen={vi.fn()} />);
    expect(screen.getByText("★ 8.4")).toBeInTheDocument();

    rerender(<EpisodeCard episode={makeEpisode({ rating: undefined })} onToggleSeen={vi.fn()} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it("calls onToggleSeen when the mark-seen button is clicked", () => {
    preferencesData = { spoilerProtection: false };
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode()} onToggleSeen={onToggleSeen} />);

    screen.getByRole("button", { name: "Mark watched" }).click();
    expect(onToggleSeen).toHaveBeenCalledTimes(1);
  });

  it("disables the mark-seen button and blocks interaction when disabled", () => {
    preferencesData = { spoilerProtection: false };
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode()} onToggleSeen={onToggleSeen} disabled />);

    const button = screen.getByRole("button", { name: "Mark watched" });
    expect(button).toBeDisabled();
    button.click();
    expect(onToggleSeen).not.toHaveBeenCalled();
  });

  it("offers the add-a-note action only while unwatched", () => {
    preferencesData = { spoilerProtection: false };
    const { rerender } = render(<EpisodeCard episode={makeEpisode({ watched: false })} onToggleSeen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add a note" })).toBeInTheDocument();

    rerender(<EpisodeCard episode={makeEpisode({ watched: true })} onToggleSeen={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add a note" })).not.toBeInTheDocument();
  });

  it("calls onToggleSeen with the written note when the add-a-note dialog is confirmed", () => {
    preferencesData = { spoilerProtection: false };
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode({ watched: false })} onToggleSeen={onToggleSeen} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    fireEvent.change(screen.getByLabelText("Your note"), { target: { value: "A tense one" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

    expect(onToggleSeen).toHaveBeenCalledWith("A tense one");
  });

  it("calls onToggleSeen with no note when the dialog is confirmed empty", () => {
    preferencesData = { spoilerProtection: false };
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode({ watched: false })} onToggleSeen={onToggleSeen} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

    expect(onToggleSeen).toHaveBeenCalledWith(undefined);
  });
});

describe("MediaDetailsHero", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the Movie badge for a movie and the Series badge for a series", () => {
    const { rerender } = render(<MediaDetailsHero media={makeMedia({ mediaType: "movie" })} />);
    expect(screen.getByText("Movie")).toBeInTheDocument();

    rerender(<MediaDetailsHero media={makeMedia({ mediaType: "series" })} />);
    expect(screen.getByText("Series")).toBeInTheDocument();
  });

  it("renders a backdrop image when backdropPath is present, and falls back to a flat background when null", () => {
    const { container, rerender } = render(<MediaDetailsHero media={makeMedia({ backdropPath: "/back.jpg" })} />);
    const backdropImg = container.querySelector("img[src*='image.tmdb.org']");
    expect(backdropImg).toHaveAttribute("src", "https://image.tmdb.org/t/p/original/back.jpg");

    rerender(<MediaDetailsHero media={makeMedia({ backdropPath: null })} />);
    expect(container.querySelector("img[src*='image.tmdb.org']")).not.toBeInTheDocument();
  });

  it("falls back to the placeholder poster when posterPath is null", () => {
    const { container } = render(<MediaDetailsHero media={makeMedia({ posterPath: null })} />);
    const images = container.querySelectorAll("img");
    const poster = Array.from(images).find((img) => img.getAttribute("sizes") === "220px");
    expect(poster).toHaveAttribute("src", expect.stringContaining("placehold.co"));
  });

  it("shows the original title only when it differs from the title", () => {
    const { rerender } = render(<MediaDetailsHero media={makeMedia({ title: "Dune", originalTitle: "Dune" })} />);
    expect(screen.queryByText("Dune", { selector: "p" })).not.toBeInTheDocument();

    rerender(<MediaDetailsHero media={makeMedia({ title: "Dune", originalTitle: "Denis's Dune" })} />);
    expect(screen.getByText("Denis's Dune")).toBeInTheDocument();
  });

  it("renders the year only when present", () => {
    const { rerender } = render(<MediaDetailsHero media={makeMedia({ year: 2021 })} />);
    expect(screen.getByText("2021")).toBeInTheDocument();

    rerender(<MediaDetailsHero media={makeMedia({ year: null })} />);
    expect(screen.queryByText("2021")).not.toBeInTheDocument();
  });

  it("renders the language only when present", () => {
    const { rerender } = render(<MediaDetailsHero media={makeMedia({ language: "en" })} />);
    expect(screen.getByText("en")).toBeInTheDocument();

    rerender(<MediaDetailsHero media={makeMedia({ language: undefined })} />);
    expect(screen.queryByText("en")).not.toBeInTheDocument();
  });

  it("falls back to the no-overview message when overview is empty", () => {
    render(<MediaDetailsHero media={makeMedia({ overview: "" })} />);
    expect(screen.getByText("No overview available for this content.")).toBeInTheDocument();
  });

  it("renders the actions and extra render-prop content", () => {
    render(
      <MediaDetailsHero
        media={makeMedia()}
        actions={<button type="button">Add to library</button>}
        extra={<span>Extra content</span>}
      />
    );

    expect(screen.getByRole("button", { name: "Add to library" })).toBeInTheDocument();
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });
});
