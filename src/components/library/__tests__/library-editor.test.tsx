import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { LibraryEditor } from "../library-editor";
import type { MediaSummary } from "@/types/media";

const save = vi.fn(() => Promise.resolve());
const refetch = vi.fn();
const useLibraryItemMock = vi.fn();

vi.mock("@/features/library/use-library", () => ({
  useLibraryItem: () => useLibraryItemMock(),
}));

const media: MediaSummary = {
  id: 7,
  mediaType: "movie",
  title: "Test Movie",
  overview: "",
  genres: [],
  cast: [],
};

const libraryItem = {
  id: "item-1",
  profileId: "default",
  mediaId: 7,
  mediaType: "movie" as const,
  status: "watching" as const,
  favourite: true,
  userRating: 8,
  notes: "Great film",
  tags: ["favourite-director"],
  rewatchCount: 1,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("LibraryEditor", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    save.mockReset();
    refetch.mockReset();
    useLibraryItemMock.mockReset();
  });

  it("does not render a Save button while the initial fetch is still in flight", () => {
    useLibraryItemMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    render(<LibraryEditor media={media} />);

    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("does not render a Save button when the initial fetch failed, and offers a retry instead", () => {
    useLibraryItemMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("sqlite unavailable"),
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    render(<LibraryEditor media={media} />);

    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /try again/i });
    retryButton.click();
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the form and lets the user save once the existing entry has loaded", () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    render(<LibraryEditor media={media} />);

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeEnabled();
    saveButton.click();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "watching",
        favourite: true,
        userRating: 8,
        notes: "Great film",
        tags: ["favourite-director"],
        rewatchCount: 1,
      })
    );
  });
});
