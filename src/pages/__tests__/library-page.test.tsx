import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { LibraryPage } from "../library-page";

// MediaGrid/MediaCard pull in their own library/progress hooks (add-to-library
// toggle, seen toggle, ...) that would need a much wider invoke() mock than
// this page's own filtering/list-management logic is about — stub it down to
// the titles so assertions can target what LibraryPage itself computed.
vi.mock("@/components/media/media-grid", () => ({
  MediaGrid: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/media/media-list", () => ({
  MediaList: ({ items }: { items: Array<{ id: number; mediaType: string; title: string }> }) => (
    <div data-testid="list">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
}));

const updatePreferenceMock = vi.fn();
const preferencesDataMock = vi.fn(() => ({ libraryViewMode: "grid" as "grid" | "list" }));
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: preferencesDataMock(), updatePreference: updatePreferenceMock, isSaving: false }),
}));

const libraryQueryMock = vi.fn();
vi.mock("@/features/library/use-library", () => ({
  useLibrary: () => libraryQueryMock(),
}));

vi.mock("@/features/progress/use-progress", () => ({
  useTrackedSeries: () => ({ data: [] }),
}));

const customListsState = {
  data: [] as Array<{ id: string; name: string; description?: string | null }>,
  isLoading: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  isSaving: false,
};
const customListItemsMock = vi.fn((listId: string) => {
  if (listId === "list-1") {
    return {
      data: [
        {
          id: "cli-only",
          listId: "list-1",
          mediaId: 10,
          mediaType: "movie",
          title: "Only In List",
          posterPath: null,
          position: 0,
          addedAt: "2026-01-05T00:00:00.000Z",
          updatedAt: "2026-01-05T00:00:00.000Z",
        },
        {
          id: "cli-dune",
          listId: "list-1",
          mediaId: 1,
          mediaType: "movie",
          title: "Dune",
          posterPath: null,
          position: 1,
          addedAt: "2026-01-04T00:00:00.000Z",
          updatedAt: "2026-01-04T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      remove: vi.fn(),
      isSaving: false,
    };
  }
  return {
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    remove: vi.fn(),
    isSaving: false,
  };
});
vi.mock("@/features/library/use-custom-lists", () => ({
  useCustomLists: () => customListsState,
  useCustomListItems: (listId: string) => customListItemsMock(listId),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<LibraryPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("LibraryPage — lists", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    libraryQueryMock.mockReset().mockReturnValue({
      data: [
        {
          mediaId: 1,
          mediaType: "movie",
          title: "Dune",
          posterPath: null,
          backdropPath: null,
          year: 2021,
          rating: 8,
          userRating: null,
          genres: [],
          status: "planned",
          favourite: false,
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        {
          mediaId: 2,
          mediaType: "series",
          title: "Severance",
          posterPath: null,
          backdropPath: null,
          year: 2022,
          rating: 9,
          userRating: null,
          genres: [],
          status: "watching",
          favourite: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    customListsState.data = [];
    customListsState.isLoading = false;
    customListsState.isError = false;
    customListsState.create.mockReset().mockResolvedValue(undefined);
    customListsState.remove.mockReset().mockResolvedValue(undefined);
    customListItemsMock.mockClear();
    updatePreferenceMock.mockReset();
    preferencesDataMock.mockReset().mockReturnValue({ libraryViewMode: "grid" });
  });

  it("persists the grid/list choice as a preference instead of resetting on remount", async () => {
    const { unmount } = renderPage();
    await screen.findByText("Dune");

    screen.getByRole("button", { name: "List view" }).click();

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "libraryViewMode", value: "list" });

    // Simulate the preference having been saved, then remount — the choice
    // should come from preferences, not reset to a fresh component's default.
    preferencesDataMock.mockReturnValue({ libraryViewMode: "list" });
    unmount();
    renderPage();

    expect(await screen.findByTestId("list")).toBeInTheDocument();
    expect(screen.queryByTestId("grid")).not.toBeInTheDocument();
  });

  it("shows every library item when no list is selected", async () => {
    renderPage();

    expect(await screen.findByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Severance")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by list")).not.toBeInTheDocument();
  });

  it("filtering by a list shows its items, including one not yet in the library, without duplicating one that is", async () => {
    customListsState.data = [{ id: "list-1", name: "Weekend", description: null }];
    renderPage();

    const select = await screen.findByLabelText("Filter by list");
    fireEvent.change(select, { target: { value: "list-1" } });

    expect(await screen.findByText("Only In List")).toBeInTheDocument();
    expect(screen.getAllByText("Dune")).toHaveLength(1);
    expect(screen.queryByText("Severance")).not.toBeInTheDocument();
  });

  it("creates a new list from the manage-lists panel", async () => {
    renderPage();

    screen.getByRole("button", { name: /Custom lists/i }).click();
    fireEvent.change(await screen.findByLabelText("List name"), { target: { value: "Weekend" } });

    const createButton = screen.getByRole("button", { name: "Create" });
    await waitFor(() => expect(createButton).toBeEnabled());
    createButton.click();

    await waitFor(() => expect(customListsState.create).toHaveBeenCalledWith({ name: "Weekend", description: "" }));
  });

  it("deleting a list goes through ConfirmDialog before calling remove", async () => {
    customListsState.data = [{ id: "list-1", name: "Weekend", description: null }];
    renderPage();

    screen.getByRole("button", { name: /Custom lists/i }).click();
    (await screen.findByRole("button", { name: "Delete list Weekend" })).click();

    const dialogConfirm = await screen.findByRole("button", { name: "Confirm" });
    expect(customListsState.remove).not.toHaveBeenCalled();
    dialogConfirm.click();

    await waitFor(() => expect(customListsState.remove).toHaveBeenCalledWith("list-1"));
  });
});
