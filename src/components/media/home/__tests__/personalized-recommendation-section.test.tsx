import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import {
  PersonalizedRecommendationSection,
  type PersonalizedRecommendationSectionProps,
} from "../personalized-recommendation-section";

vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; title: string }> }) => (
    <div data-testid="media-grid">
      {items.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
}));

function baseProps(): PersonalizedRecommendationSectionProps {
  return {
    becauseYouLiked: { seedTitle: null, items: [] },
    favouriteGenreRail: { genre: null, items: [] },
    peopleYouWatch: { topDirector: null, directorItems: [], topActor: null, actorItems: [] },
  };
}

describe("PersonalizedRecommendationSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing when every signal is empty", () => {
    const { container } = render(<PersonalizedRecommendationSection {...baseProps()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the becauseYouLiked block alone", () => {
    render(
      <PersonalizedRecommendationSection
        {...baseProps()}
        becauseYouLiked={{
          seedTitle: "Arrival",
          items: [{ id: 1, mediaType: "movie", title: "Interstellar" } as never],
        }}
      />
    );

    expect(screen.getByText(i18n.t("home.becauseYouLiked", { title: "Arrival" }))).toBeInTheDocument();
    expect(screen.getByText("Interstellar")).toBeInTheDocument();
  });

  it("renders the favouriteGenreRail block alone", () => {
    render(
      <PersonalizedRecommendationSection
        {...baseProps()}
        favouriteGenreRail={{
          genre: { id: 18, label: "Drama", labelKey: "genres.drama", icon: "drama", movieId: 18, seriesId: 18 },
          items: [{ id: 2, mediaType: "movie", title: "Manchester by the Sea" } as never],
        }}
      />
    );

    expect(screen.getByText("Manchester by the Sea")).toBeInTheDocument();
  });

  it("renders peopleYouWatch's director and actor rails via PeopleYouWatchRails", () => {
    render(
      <PersonalizedRecommendationSection
        {...baseProps()}
        peopleYouWatch={{
          topDirector: { id: 42, name: "Denis Villeneuve", count: 3 },
          directorItems: [{ id: 100, mediaType: "movie", title: "Dune: Part Two" } as never],
          topActor: { id: 7, name: "Zendaya", count: 3 },
          actorItems: [{ id: 200, mediaType: "movie", title: "Challengers" } as never],
        }}
      />
    );

    expect(screen.getByText(i18n.t("home.becauseYouWatchDirector", { name: "Denis Villeneuve" }))).toBeInTheDocument();
    expect(screen.getByText("Dune: Part Two")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("home.becauseYouWatchActor", { name: "Zendaya" }))).toBeInTheDocument();
    expect(screen.getByText("Challengers")).toBeInTheDocument();
  });

  it("does not render becauseYouLiked's block when it has a seed title but no items yet", () => {
    const { container } = render(
      <PersonalizedRecommendationSection {...baseProps()} becauseYouLiked={{ seedTitle: "Arrival", items: [] }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
