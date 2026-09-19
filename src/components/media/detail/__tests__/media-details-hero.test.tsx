import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { MediaSummary } from "@/types/media";
import { MediaDetailsHero } from "../media-details-hero";

function buildMedia(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 1,
    mediaType: "movie",
    title: "Dune",
    overview: "",
    genres: [],
    cast: [],
    ...overrides,
  };
}

describe("MediaDetailsHero", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the certification badge when the title has one", () => {
    render(<MediaDetailsHero media={buildMedia({ certification: "PG-13" })} />);
    expect(screen.getByText("PG-13")).toBeInTheDocument();
  });

  it("renders no certification badge when the title has none", () => {
    render(<MediaDetailsHero media={buildMedia({ certification: null })} />);
    expect(screen.queryByText("PG-13")).not.toBeInTheDocument();
  });

  it("uses posterPathOverride's image instead of the media's own poster when given", () => {
    const { container } = render(
      <MediaDetailsHero
        media={buildMedia({ posterPath: "/series-poster.jpg" })}
        posterPathOverride="/season-poster.jpg"
      />
    );
    const poster = container.querySelector("img[src*='season-poster.jpg']");
    expect(poster).toBeInTheDocument();
    expect(container.querySelector("img[src*='series-poster.jpg']")).not.toBeInTheDocument();
  });

  it("falls back to the media's own poster when no override is given", () => {
    const { container } = render(<MediaDetailsHero media={buildMedia({ posterPath: "/series-poster.jpg" })} />);
    expect(container.querySelector("img[src*='series-poster.jpg']")).toBeInTheDocument();
  });
});
