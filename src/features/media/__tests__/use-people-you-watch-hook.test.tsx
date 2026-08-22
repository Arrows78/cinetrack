import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";
import type { LibraryItem } from "@/types/media";

const libraryDataMock = vi.fn<() => LibraryItem[] | undefined>();
const getMovieDetailsMock = vi.fn();
const getSeriesDetailsMock = vi.fn();
const discoverMoviesMock = vi.fn();

vi.mock("@/features/library/use-library", () => ({
  useLibrary: () => ({ data: libraryDataMock() }),
}));
vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "default",
}));
vi.mock("@/features/media/media-repository", () => ({
  mediaRepository: {
    getMovieDetails: (id: number) => getMovieDetailsMock(id) as Promise<unknown>,
    getSeriesDetails: (id: number) => getSeriesDetailsMock(id) as Promise<unknown>,
    discoverMovies: (args: unknown) => discoverMoviesMock(args) as Promise<unknown>,
  },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  libraryDataMock.mockReset();
  getMovieDetailsMock.mockReset();
  getSeriesDetailsMock.mockReset();
  discoverMoviesMock.mockReset();
  discoverMoviesMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 0, results: [] });
});

describe("usePeopleYouWatch", () => {
  it("surfaces neither rail when the library has no completed titles", async () => {
    libraryDataMock.mockReturnValue([makeLibraryItem({ status: "planned" })]);
    const { usePeopleYouWatch } = await import("../use-people-you-watch");

    const { result } = renderHook(() => usePeopleYouWatch(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isActorLoading).toBe(false));
    expect(result.current.topActor).toBeNull();
    expect(result.current.topDirector).toBeNull();
    expect(getMovieDetailsMock).not.toHaveBeenCalled();
  });

  it("fetches credits for completed titles, aggregates, and queries discover for the top director", async () => {
    const director = { id: 42, name: "Denis Villeneuve", job: "Director", profilePath: null };
    libraryDataMock.mockReturnValue([
      makeLibraryItem({ id: "a", mediaId: 1, mediaType: "movie", status: "completed" }),
      makeLibraryItem({ id: "b", mediaId: 2, mediaType: "movie", status: "completed" }),
      makeLibraryItem({ id: "c", mediaId: 3, mediaType: "movie", status: "completed" }),
    ]);
    getMovieDetailsMock.mockImplementation((id: number) =>
      Promise.resolve(makeMedia({ id, mediaType: "movie", cast: [], directors: id === 3 ? [] : [director] }))
    );
    const recommended = makeMedia({ id: 999, mediaType: "movie", title: "Dune: Part Two" });
    discoverMoviesMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 1, results: [recommended] });

    const { usePeopleYouWatch } = await import("../use-people-you-watch");
    const { result } = renderHook(() => usePeopleYouWatch(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isDirectorLoading).toBe(false));

    expect(getMovieDetailsMock).toHaveBeenCalledTimes(3);
    expect(result.current.topDirector?.id).toBe(42);
    expect(result.current.topDirector?.count).toBe(2);
    expect(discoverMoviesMock).toHaveBeenCalledWith(expect.objectContaining({ withCrew: 42 }));
    expect(result.current.directorItems.map((item) => item.id)).toEqual([999]);
  });

  it("filters a discovered title out of the rail if it's already in the library", async () => {
    const director = { id: 42, name: "Denis Villeneuve", job: "Director", profilePath: null };
    libraryDataMock.mockReturnValue([
      makeLibraryItem({ id: "a", mediaId: 1, mediaType: "movie", status: "completed" }),
      makeLibraryItem({ id: "b", mediaId: 2, mediaType: "movie", status: "completed" }),
      makeLibraryItem({ id: "c", mediaId: 999, mediaType: "movie", status: "planned" }),
    ]);
    getMovieDetailsMock.mockImplementation((id: number) =>
      Promise.resolve(makeMedia({ id, mediaType: "movie", cast: [], directors: [director] }))
    );
    const alreadyOwned = makeMedia({ id: 999, mediaType: "movie", title: "Already In Library" });
    discoverMoviesMock.mockResolvedValue({ page: 1, totalPages: 1, totalResults: 1, results: [alreadyOwned] });

    const { usePeopleYouWatch } = await import("../use-people-you-watch");
    const { result } = renderHook(() => usePeopleYouWatch(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isDirectorLoading).toBe(false));
    expect(result.current.directorItems).toEqual([]);
  });
});
