import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { MediaListRow } from "../media-list-row";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

const isMovieSeenMock = vi.fn();
vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    isMovieSeen: (...args: unknown[]) => isMovieSeenMock(...args),
    toggleMovieSeen: vi.fn(),
  },
}));

function renderRow(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, {
    wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("MediaListRow", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    isMovieSeenMock.mockReset().mockResolvedValue(false);
  });

  it("renders the title, year, genre and links to the right detail route", () => {
    renderRow(
      <MediaListRow media={makeMedia({ title: "Dune", year: 2021, genres: ["Sci-Fi"], mediaType: "movie" })} />
    );

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/movies/$movieId");
  });

  it("shows a mark-seen toggle for movies", async () => {
    renderRow(<MediaListRow media={makeMedia({ id: 7, mediaType: "movie" })} />);
    expect(await screen.findByRole("button", { name: "Mark watched" })).toBeInTheDocument();
  });

  it("does not show a mark-seen toggle for series", async () => {
    renderRow(<MediaListRow media={makeMedia({ id: 8, mediaType: "series" })} />);
    expect(screen.queryByRole("button", { name: "Mark watched" })).not.toBeInTheDocument();
  });

  it("shows an Up to date badge for a still-airing series caught up on every aired episode", () => {
    renderRow(
      <MediaListRow
        media={makeMedia({ id: 10, mediaType: "series" })}
        progress={{ watched: 24, total: 24, seriesStatus: "Returning Series" }}
      />
    );

    expect(screen.getByText("All up to date")).toBeInTheDocument();
  });

  it("does not show an Up to date badge once the series has actually ended", () => {
    renderRow(
      <MediaListRow
        media={makeMedia({ id: 10, mediaType: "series" })}
        progress={{ watched: 24, total: 24, seriesStatus: "Ended" }}
      />
    );

    expect(screen.queryByText("All up to date")).not.toBeInTheDocument();
  });

  it("does not show an Up to date badge while still catching up", () => {
    renderRow(
      <MediaListRow
        media={makeMedia({ id: 10, mediaType: "series" })}
        progress={{ watched: 8, total: 24, seriesStatus: "Returning Series" }}
      />
    );

    expect(screen.queryByText("All up to date")).not.toBeInTheDocument();
    expect(screen.getByText("8/24")).toBeInTheDocument();
  });
});
