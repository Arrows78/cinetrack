import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { MediaCard } from "../media-card";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

const libraryHasMock = vi.fn();
const removeIfPlannedMock = vi.fn();
const forceRemoveMock = vi.fn();
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: {
    has: (...args: unknown[]) => libraryHasMock(...args),
    save: vi.fn(),
    removeIfPlanned: (...args: unknown[]) => removeIfPlannedMock(...args),
    remove: (...args: unknown[]) => forceRemoveMock(...args),
  },
}));

const isMovieSeenMock = vi.fn();
vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    isMovieSeen: (...args: unknown[]) => isMovieSeenMock(...args),
    toggleMovieSeen: vi.fn(),
  },
}));

function renderCard(media: ReturnType<typeof makeMedia>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<MediaCard media={media} />, { wrapper: Wrapper });
}

describe("MediaCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    libraryHasMock.mockReset().mockResolvedValue(false);
    isMovieSeenMock.mockReset().mockResolvedValue(false);
    removeIfPlannedMock.mockReset().mockResolvedValue(true);
    forceRemoveMock.mockReset().mockResolvedValue(undefined);
  });

  it("renders the title, year, first genre and rating", () => {
    renderCard(makeMedia({ title: "Dune", year: 2021, rating: 8.05, genres: ["Sci-Fi", "Drama"] }));

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    expect(screen.getByText("8.1")).toBeInTheDocument();
  });

  it("links movies and series to their own detail routes", () => {
    const { rerender } = renderCard(makeMedia({ id: 42, mediaType: "movie" }));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/movies/$movieId");

    rerender(<MediaCard media={makeMedia({ id: 42, mediaType: "series" })} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/series/$seriesId");
  });

  it("falls back to the placeholder poster and unknown year", () => {
    const { container } = renderCard(makeMedia({ posterPath: null, year: null }));

    // The poster is decorative (alt="") since the title is already visible
    // text in the same card, so it isn't exposed via role="img" — query the
    // DOM directly. Vite inlines the placeholder SVG as a data: URI; the
    // real point is that the src is not a TMDB URL.
    const image = container.querySelector("img");
    expect(image).not.toHaveAttribute("src", expect.stringContaining("image.tmdb.org"));
    expect(screen.getByText("Unknown year")).toBeInTheDocument();
  });

  it("shows an add-to-library quick action that toggles state on click", async () => {
    const { libraryRepository } = await import("@/features/library/library-repository");
    renderCard(makeMedia({ id: 7, mediaType: "movie" }));

    const button = await screen.findByRole("button", { name: "Add to library" });
    button.click();

    await waitFor(() => expect(libraryRepository.save).toHaveBeenCalled());
  });

  it("offers to really remove a title once removeIfPlanned reports it has real progress", async () => {
    libraryHasMock.mockResolvedValue(true);
    removeIfPlannedMock.mockResolvedValue(false);
    renderCard(makeMedia({ id: 7, mediaType: "movie" }));

    const button = await screen.findByRole("button", { name: "In library" });
    button.click();

    await waitFor(() => expect(removeIfPlannedMock).toHaveBeenCalledWith(7, "movie"));
    expect(await screen.findByText("Remove this title from your library?")).toBeInTheDocument();

    screen.getByRole("button", { name: "Confirm" }).click();

    await waitFor(() => expect(forceRemoveMock).toHaveBeenCalledWith(7, "movie"));
  });

  it("shows a mark-seen quick action for movies", async () => {
    renderCard(makeMedia({ id: 7, mediaType: "movie" }));
    expect(await screen.findByRole("button", { name: "Mark watched" })).toBeInTheDocument();
  });

  it("does not show a mark-seen quick action for series", async () => {
    renderCard(makeMedia({ id: 8, mediaType: "series" }));
    await screen.findByRole("button", { name: "Add to library" });
    expect(screen.queryByRole("button", { name: "Mark watched" })).not.toBeInTheDocument();
  });

  it("shows a finished bar for an already-seen movie, and no redundant Seen badge", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<MediaCard media={makeMedia({ id: 9, mediaType: "movie" })} alreadySeen />, { wrapper: Wrapper });

    const bar = await screen.findByRole("progressbar", { name: "Seen" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
  });

  it("reports raw watched/total counts (not a percentage) on a series' progress bar", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(
      <MediaCard
        media={makeMedia({ id: 10, mediaType: "series" })}
        progress={{ watched: 8, total: 24, seriesStatus: "returning" }}
      />,
      { wrapper: Wrapper }
    );

    const bar = await screen.findByRole("progressbar", { name: "Episodes" });
    expect(bar).toHaveAttribute("aria-valuenow", "8");
    expect(bar).toHaveAttribute("aria-valuemax", "24");
  });
});
