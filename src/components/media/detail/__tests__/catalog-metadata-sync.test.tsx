import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { LibraryItem, MediaSummary } from "@/types/media";
import { CatalogMetadataSync } from "../catalog-metadata-sync";

const libraryItemDataMock = vi.fn<() => LibraryItem | undefined>(() => undefined);
const refreshMock = vi.fn(async () => undefined);

vi.mock("@/features/library/use-library", () => ({
  useLibraryItem: () => ({ data: libraryItemDataMock() }),
  useRefreshLibraryCatalogMetadata: () => refreshMock,
}));

const media: MediaSummary = {
  id: 7,
  mediaType: "movie",
  title: "Test Movie",
  overview: "",
  posterPath: null,
  backdropPath: null,
  year: 2024,
  rating: 8.1,
  genres: [],
  cast: [],
};

describe("CatalogMetadataSync", () => {
  beforeEach(() => {
    libraryItemDataMock.mockReset().mockReturnValue(undefined);
    refreshMock.mockClear();
  });

  it("renders nothing", () => {
    const { container } = render(<CatalogMetadataSync media={media} />);
    expect(container.firstChild).toBeNull();
  });

  it("does not refresh when no library entry exists for this title", async () => {
    render(<CatalogMetadataSync media={media} />);
    await waitFor(() => expect(refreshMock).not.toHaveBeenCalled());
  });

  it("does not refresh when the library entry's year/rating already match", async () => {
    libraryItemDataMock.mockReturnValue({ year: 2024, rating: 8.1 } as LibraryItem);
    render(<CatalogMetadataSync media={media} />);
    await waitFor(() => expect(refreshMock).not.toHaveBeenCalled());
  });

  it("refreshes when the library entry's cached year/rating are stale", async () => {
    libraryItemDataMock.mockReturnValue({ year: null, rating: null } as unknown as LibraryItem);
    render(<CatalogMetadataSync media={media} />);
    await waitFor(() =>
      expect(refreshMock).toHaveBeenCalledWith({ mediaId: 7, mediaType: "movie", year: 2024, rating: 8.1 })
    );
  });
});
