import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { WatchTonightTeaserSection } from "../watch-tonight-teaser-section";
import type { Movie } from "@/types/media";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; title: string }> }) => (
    <div data-testid="media-grid">
      {items.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
}));

function movie(overrides: Partial<Movie> = {}): Movie {
  return { id: 1, mediaType: "movie", title: "Dune", overview: "", genres: [], cast: [], ...overrides };
}

describe("WatchTonightTeaserSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing for an empty items array", () => {
    const { container } = render(<WatchTonightTeaserSection items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the section header, the picks, and a link to the full Watch Tonight page", () => {
    render(<WatchTonightTeaserSection items={[movie(), movie({ id: 2, title: "Arrival" })]} />);

    expect(screen.getByRole("heading", { name: i18n.t("home.watchTonightTeaser") })).toBeInTheDocument();
    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Arrival")).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: new RegExp(i18n.t("home.watchTonightTeaserCta")) });
    expect(cta).toHaveAttribute("href", "/watch-tonight");
  });
});
