import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { Film } from "lucide-react";

import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { progressBarTone } from "@/shared/utils/series-status";
import { MediaListRow } from "../media-list-row";
import { MediaList } from "../media-list";
import { MediaListView } from "../media-list-view";
import type { MediaGridItem } from "../media-grid";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

const useMovieSeenMock = vi.fn();
vi.mock("@/features/progress/use-progress", () => ({
  useMovieSeen: (...args: unknown[]) => useMovieSeenMock(...args),
}));

function renderWithQueryClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(node, {
    wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("media-list-views", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useMovieSeenMock.mockReset().mockReturnValue({ data: false, isSaving: false, toggleMovieSeen: vi.fn() });
  });

  describe("MediaListRow", () => {
    it("renders an inline seen-toggle for a movie that toggles the flipped state without navigating", () => {
      const toggleMovieSeen = vi.fn();
      useMovieSeenMock.mockReturnValue({ data: false, isSaving: false, toggleMovieSeen });
      const movie = makeMedia({ id: 5, mediaType: "movie" });
      render(<MediaListRow media={movie} />);

      const button = screen.getByRole("button", { name: "Mark watched" });
      const clickEvent = createEvent.click(button);
      const preventDefaultSpy = vi.spyOn(clickEvent, "preventDefault");
      const stopPropagationSpy = vi.spyOn(clickEvent, "stopPropagation");
      fireEvent(button, clickEvent);

      expect(toggleMovieSeen).toHaveBeenCalledWith({ movie, watched: true });
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });

    it("toggles the other way once already seen", () => {
      const toggleMovieSeen = vi.fn();
      useMovieSeenMock.mockReturnValue({ data: true, isSaving: false, toggleMovieSeen });
      const movie = makeMedia({ id: 6, mediaType: "movie" });
      render(<MediaListRow media={movie} />);

      fireEvent.click(screen.getByRole("button", { name: "Mark unwatched" }));
      expect(toggleMovieSeen).toHaveBeenCalledWith({ movie, watched: false });
    });

    it("renders a chevron instead of a seen-toggle for a series", () => {
      const { container } = render(<MediaListRow media={makeMedia({ id: 7, mediaType: "series" })} />);

      expect(screen.queryByRole("button", { name: "Mark watched" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark unwatched" })).not.toBeInTheDocument();
      expect(container.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    });

    it("renders the progress bar with the computed percent and a non-default tone when progress is present", () => {
      // watched === total but the series itself isn't ended yet: caughtUp,
      // a distinct tone from the plain in-progress default.
      const tone = progressBarTone(5, 5, "Returning Series");
      expect(tone).toBe("caughtUp");

      render(
        <MediaListRow
          media={makeMedia({ id: 8, mediaType: "series" })}
          progress={{ watched: 5, total: 5, seriesStatus: "Returning Series" }}
        />
      );

      const bar = screen.getByRole("progressbar", { name: "Episodes" });
      expect(bar).toHaveAttribute("aria-valuenow", "100");
      const fill = bar.firstElementChild as HTMLElement;
      expect(fill.style.background).toBe("hsl(var(--success) / 0.6)");
      expect(screen.getByText("5/5")).toBeInTheDocument();
    });

    it("renders a finished 100% bar for an already-seen movie with no progress object", () => {
      render(<MediaListRow media={makeMedia({ id: 9, mediaType: "movie" })} alreadySeen />);

      const bar = screen.getByRole("progressbar", { name: "Seen" });
      expect(bar).toHaveAttribute("aria-valuenow", "100");
      const fill = bar.firstElementChild as HTMLElement;
      expect(fill.style.background).toBe("hsl(var(--success))");
    });

    it("renders no bar at all when there is neither progress nor an already-seen flag", () => {
      render(<MediaListRow media={makeMedia({ id: 10, mediaType: "movie" })} />);
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("falls back to the bundled placeholder poster when posterPath is null", () => {
      const { container } = render(<MediaListRow media={makeMedia({ id: 11, posterPath: null })} />);
      const image = container.querySelector("img");
      expect(image).not.toHaveAttribute("src", expect.stringContaining("image.tmdb.org"));
    });

    it("shows the first genre only when present", () => {
      const { rerender } = render(<MediaListRow media={makeMedia({ id: 12, genres: ["Comedy", "Romance"] })} />);
      expect(screen.getByText("· Comedy")).toBeInTheDocument();

      rerender(<MediaListRow media={makeMedia({ id: 12, genres: [] })} />);
      expect(screen.queryByText(/Comedy/)).not.toBeInTheDocument();
    });
  });

  describe("MediaList", () => {
    it("renders the given items through real MediaListRow instances", async () => {
      const items: MediaGridItem[] = [
        makeMedia({ id: 1, mediaType: "movie", title: "Movie Title" }),
        makeMedia({ id: 2, mediaType: "series", title: "Series Title" }),
      ];
      render(<MediaList items={items} />);

      expect(await screen.findByText("Movie Title")).toBeInTheDocument();
      expect(screen.getByText("Series Title")).toBeInTheDocument();
    });

    it("keeps computeItemKey unique for colliding numeric ids across media types", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const items: MediaGridItem[] = [
        makeMedia({ id: 1, mediaType: "movie", title: "Movie One" }),
        makeMedia({ id: 1, mediaType: "series", title: "Series One" }),
      ];
      render(<MediaList items={items} />);

      expect(await screen.findByText("Movie One")).toBeInTheDocument();
      expect(screen.getByText("Series One")).toBeInTheDocument();
      const sameKeyWarning = errorSpy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("same key"))
      );
      expect(sameKeyWarning).toBe(false);
      errorSpy.mockRestore();
    });
  });

  describe("MediaListView", () => {
    function baseQuery(overrides: Partial<Parameters<typeof MediaListView>[0]["query"]> = {}) {
      return {
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn().mockResolvedValue(undefined),
        items: [],
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    const viewProps = {
      icon: Film,
      title: "Test Title",
      subtitle: "Test subtitle",
      emptyTitle: "Nothing here",
      emptyDescription: "Nothing to show yet",
    };

    it("renders a loading skeleton while the query is loading", () => {
      const { container } = render(<MediaListView query={baseQuery({ isLoading: true })} {...viewProps} />);
      expect(screen.queryByText("Test Title")).not.toBeInTheDocument();
      expect(container.querySelector(".animate-shimmer")).not.toBeNull();
    });

    it("renders a remote error state and retries through query.refetch", () => {
      const refetch = vi.fn().mockResolvedValue(undefined);
      render(<MediaListView query={baseQuery({ isError: true, error: new Error("boom"), refetch })} {...viewProps} />);

      expect(screen.getByText("Unable to load the catalogue")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(refetch).toHaveBeenCalled();
    });

    it("renders the empty state when there are no items", () => {
      render(<MediaListView query={baseQuery({ items: [] })} {...viewProps} />);
      expect(screen.getByText("Nothing here")).toBeInTheDocument();
      expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
    });

    it("renders the section header and grid items on the happy path, without a load-more button", async () => {
      const items = [makeMedia({ id: 21, title: "Happy Path Movie" })];
      renderWithQueryClient(<MediaListView query={baseQuery({ items })} {...viewProps} />);

      expect(screen.getByRole("heading", { name: "Test Title" })).toBeInTheDocument();
      expect(await screen.findByText("Happy Path Movie")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });

    it("renders a load-more button that calls fetchNextPage when there is a next page", async () => {
      const items = [makeMedia({ id: 22, title: "Paged Movie" })];
      const fetchNextPage = vi.fn().mockResolvedValue(undefined);
      renderWithQueryClient(
        <MediaListView query={baseQuery({ items, hasNextPage: true, fetchNextPage })} {...viewProps} />
      );

      expect(await screen.findByText("Paged Movie")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(fetchNextPage).toHaveBeenCalled();
    });
  });
});
