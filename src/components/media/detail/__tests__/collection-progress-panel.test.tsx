import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";
import type { LibraryItem, Movie, MovieCollection } from "@/types/media";

const collectionQueryMock = vi.fn();
const libraryDataMock = vi.fn<() => LibraryItem[] | undefined>();
const addPlannedMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/features/media/use-collection", () => ({
  useMovieCollection: (...args: unknown[]) => collectionQueryMock(...args),
}));
vi.mock("@/features/library/use-library", () => ({
  useLibraryItemsByKeys: () => ({ data: libraryDataMock(), isPending: false }),
  useLibraryQuickToggle: () => ({ addPlanned: addPlannedMock, isSaving: false }),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock("@/shared/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; title: string }> }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
}));

import { CollectionProgressPanel } from "@/components/media/detail/collection-progress-panel";

const movie = (overrides: Partial<Movie> = {}): Movie => ({
  ...(makeMedia(overrides) as Movie),
  mediaType: "movie",
});

const collection = (parts: Movie[]): MovieCollection => ({
  id: 10,
  name: "Dune Collection",
  overview: "",
  posterPath: null,
  backdropPath: null,
  parts,
});

describe("CollectionProgressPanel", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    collectionQueryMock.mockReset();
    // A real useQuery() call always returns a query-shaped object, even
    // when disabled (useMovieCollection is disabled until a collectionId
    // exists) — this default matches that contract for tests that never
    // override it (e.g. the "no collection" case below).
    collectionQueryMock.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    libraryDataMock.mockReset();
    addPlannedMock.mockReset();
    toastMock.mockReset();
  });

  it("renders nothing when the movie doesn't belong to a collection", () => {
    const { container } = render(<CollectionProgressPanel movie={movie({ id: 1, collection: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a single-movie 'collection' (no real franchise progress to show)", () => {
    collectionQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: collection([movie({ id: 1 })]),
    });
    libraryDataMock.mockReturnValue([]);

    const { container } = render(
      <CollectionProgressPanel movie={movie({ id: 1, collection: { id: 10, name: "Solo" } })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the watched/total count and lists entries in their watched/planned/missing buckets", () => {
    const watchedPart = movie({ id: 1, title: "Part One" });
    const plannedPart = movie({ id: 2, title: "Part Two" });
    const missingPart = movie({ id: 3, title: "Part Three" });
    collectionQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: collection([watchedPart, plannedPart, missingPart]),
    });
    libraryDataMock.mockReturnValue([
      makeLibraryItem({ id: "a", mediaId: 1, mediaType: "movie", status: "completed" }),
      makeLibraryItem({ id: "b", mediaId: 2, mediaType: "movie", status: "watching" }),
    ]);

    render(<CollectionProgressPanel movie={movie({ id: 1, collection: { id: 10, name: "Dune Collection" } })} />);

    expect(screen.getByText("Dune Collection")).toBeInTheDocument();
    expect(screen.getByText("1 / 3 watched")).toBeInTheDocument();
    expect(screen.getByText("Part One")).toBeInTheDocument();
    expect(screen.getByText("Part Two")).toBeInTheDocument();
    expect(screen.getByText("Part Three")).toBeInTheDocument();
  });

  it("only offers the 'add missing' action for entries with no library row at all", async () => {
    const missingPart = movie({ id: 3, title: "Missing Part" });
    collectionQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: collection([movie({ id: 1, title: "Watched Part" }), missingPart]),
    });
    libraryDataMock.mockReturnValue([
      makeLibraryItem({ id: "a", mediaId: 1, mediaType: "movie", status: "completed" }),
    ]);
    addPlannedMock.mockResolvedValue(undefined);

    render(<CollectionProgressPanel movie={movie({ id: 1, collection: { id: 10, name: "Dune Collection" } })} />);

    const button = screen.getByRole("button", { name: /add 1 missing movie/i });
    fireEvent.click(button);

    await waitFor(() => expect(addPlannedMock).toHaveBeenCalledTimes(1));
    expect(addPlannedMock).toHaveBeenCalledWith(missingPart);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("1") }));
  });

  it("shows a translated error toast (never the raw error) when adding missing entries fails", async () => {
    collectionQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: collection([movie({ id: 1 }), movie({ id: 2, title: "Missing Part" })]),
    });
    libraryDataMock.mockReturnValue([]);
    addPlannedMock.mockRejectedValue(new Error("boom: raw sql detail"));

    render(<CollectionProgressPanel movie={movie({ id: 1, collection: { id: 10, name: "Dune Collection" } })} />);

    fireEvent.click(screen.getByRole("button", { name: /add 2 missing movies/i }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const [{ description, variant }] = toastMock.mock.calls[toastMock.mock.calls.length - 1] as [
      { description: string; variant: string },
    ];
    expect(variant).toBe("error");
    expect(description).not.toContain("boom");
  });

  it("renders a partial error state, not a crash, when the collection fails to load", () => {
    collectionQueryMock.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: vi.fn() });
    libraryDataMock.mockReturnValue([]);

    render(<CollectionProgressPanel movie={movie({ id: 1, collection: { id: 10, name: "Dune Collection" } })} />);

    expect(screen.getByText(/couldn't load this collection/i)).toBeInTheDocument();
  });
});
