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
});
