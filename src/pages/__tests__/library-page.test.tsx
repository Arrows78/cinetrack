import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { LibraryExplorer } from "@/components/media/library-explorer";
import { LibraryPage } from "../library-page";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

// Shallow stubs so lockedMediaType branches can be asserted on without
// exercising these sections' own hooks (next-episode resolution, seen
// toggles, ...) — that behavior belongs to library-sections.test.tsx.
vi.mock("@/components/media/library-sections", () => ({
  SeriesLibrarySections: ({ items }: { items: Array<{ id: number; title: string }> }) => (
    <div data-testid="series-sections">
      {items.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
  MovieLibrarySections: ({ items }: { items: Array<{ id: number; title: string }> }) => (
    <div data-testid="movie-sections">
      {items.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
}));

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
const listItemsErrorRefetchMock = vi.fn();
const customListItemsMock = vi.fn((listId: string) => {
  if (listId === "list-err") {
    return {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error("list items failed"),
      refetch: listItemsErrorRefetchMock,
      remove: vi.fn(),
      isSaving: false,
    };
  }
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

// Succinct fixture builder for the sort/filter test groups below — only the
// fields LibraryExplorer actually reads need to vary per test.
function makeLibraryItem(overrides: {
  mediaId: number;
  mediaType?: "movie" | "series";
  title: string;
  rating?: number | null;
  status?: "planned" | "watching" | "paused" | "completed" | "dropped";
  favourite?: boolean;
  updatedAt?: string;
}) {
  return {
    mediaId: overrides.mediaId,
    mediaType: overrides.mediaType ?? "movie",
    title: overrides.title,
    posterPath: null,
    backdropPath: null,
    year: 2020,
    rating: overrides.rating ?? null,
    userRating: null,
    genres: [],
    status: overrides.status ?? "planned",
    favourite: overrides.favourite ?? false,
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<LibraryPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

// Renders LibraryExplorer standalone for props LibraryPage never passes
// (lockedMediaType, onBrowseAll, browseAllLabel) — those are only supplied
// by the /movies and /series "My list" tab hosts.
function renderExplorer(props: Parameters<typeof LibraryExplorer>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<LibraryExplorer {...props} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

// Hoisted to file scope (rather than nested in one describe) so every
// describe block below — including the LibraryExplorer-focused ones added
// alongside the original LibraryPage list-management tests — starts from
// the same default library/custom-lists fixtures and mock reset.
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
    listItemsErrorRefetchMock.mockReset();
    updatePreferenceMock.mockReset();
    preferencesDataMock.mockReset().mockReturnValue({ libraryViewMode: "grid" });
});

describe("LibraryPage — lists", () => {
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

describe("LibraryExplorer — lockedMediaType", () => {
  
  it("hides the type filter and pre-applies it when locked to movies", async () => {
    renderExplorer({ lockedMediaType: "movie" });

    const sections = await screen.findByTestId("movie-sections");
    expect(within(sections).getByText("Dune")).toBeInTheDocument();
    expect(within(sections).queryByText("Severance")).not.toBeInTheDocument();
    expect(screen.queryByTestId("series-sections")).not.toBeInTheDocument();
    expect(screen.queryByTestId("grid")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Movies" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Series" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Custom lists/i })).not.toBeInTheDocument();
  });

  it("hides the type filter and pre-applies it when locked to series, rendering SeriesLibrarySections", async () => {
    renderExplorer({ lockedMediaType: "series" });

    const sections = await screen.findByTestId("series-sections");
    expect(within(sections).getByText("Severance")).toBeInTheDocument();
    expect(within(sections).queryByText("Dune")).not.toBeInTheDocument();
    expect(screen.queryByTestId("movie-sections")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Movies" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Series" })).not.toBeInTheDocument();
  });

  it("shows the type filter and the plain grid when no type is locked", async () => {
    renderExplorer();

    expect(await screen.findByRole("button", { name: "Movies" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Series" })).toBeInTheDocument();
    expect(screen.getByTestId("grid")).toBeInTheDocument();
  });
});

describe("LibraryExplorer — favourites filter", () => {
  
  it("filters down to favourites only and reflects the pressed state", async () => {
    libraryQueryMock.mockReturnValue({
      data: [
        makeLibraryItem({ mediaId: 1, title: "Dune", favourite: false }),
        makeLibraryItem({ mediaId: 2, mediaType: "series", title: "Severance", favourite: true }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await screen.findByText("Dune");
    const favouritesButton = screen.getByRole("button", { name: "Favourites" });
    expect(favouritesButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(favouritesButton);

    expect(favouritesButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Dune")).not.toBeInTheDocument();
    expect(screen.getByText("Severance")).toBeInTheDocument();
  });
});

describe("LibraryExplorer — sorting", () => {
  
  beforeEach(() => {
    // Title (asc) order: Apple, Banana, Cherry.
    // Rating (desc, null -> 0) order: Banana(9), Cherry(5), Apple(null).
    // Recent (desc updatedAt) order: Cherry, Apple, Banana.
    libraryQueryMock.mockReturnValue({
      data: [
        makeLibraryItem({ mediaId: 1, title: "Apple", rating: null, updatedAt: "2026-01-02T00:00:00.000Z" }),
        makeLibraryItem({ mediaId: 2, title: "Banana", rating: 9, updatedAt: "2026-01-01T00:00:00.000Z" }),
        makeLibraryItem({ mediaId: 3, title: "Cherry", rating: 5, updatedAt: "2026-01-03T00:00:00.000Z" }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  function titlesInGrid() {
    return within(screen.getByTestId("grid"))
      .getAllByText(/^(Apple|Banana|Cherry)$/)
      .map((el) => el.textContent);
  }

  it("sorts by most recently updated by default", async () => {
    renderPage();

    await screen.findByText("Apple");
    expect(titlesInGrid()).toEqual(["Cherry", "Apple", "Banana"]);
  });

  it("sorts alphabetically by title when selected", async () => {
    renderPage();
    await screen.findByText("Apple");

    fireEvent.click(screen.getByRole("button", { name: "Title" }));

    expect(titlesInGrid()).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("sorts by rating descending, falling back to 0 for a null rating", async () => {
    renderPage();
    await screen.findByText("Apple");

    fireEvent.click(screen.getByRole("button", { name: "Rating" }));

    expect(titlesInGrid()).toEqual(["Banana", "Cherry", "Apple"]);
  });
});

describe("LibraryExplorer — status filter", () => {
  
  beforeEach(() => {
    libraryQueryMock.mockReturnValue({
      data: [
        makeLibraryItem({ mediaId: 1, title: "PlannedItem", status: "planned" }),
        makeLibraryItem({ mediaId: 2, title: "WatchingItem", status: "watching" }),
        makeLibraryItem({ mediaId: 3, title: "PausedItem", status: "paused" }),
        makeLibraryItem({ mediaId: 4, title: "CompletedItem", status: "completed" }),
        makeLibraryItem({ mediaId: 5, title: "DroppedItem", status: "dropped" }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it.each([
    { label: "To watch", visible: "PlannedItem" },
    { label: "Watching", visible: "WatchingItem" },
    { label: "Paused", visible: "PausedItem" },
    { label: "Completed", visible: "CompletedItem" },
    { label: "Dropped", visible: "DroppedItem" },
  ])("filtering by status $label shows only $visible", async ({ label, visible }) => {
    renderPage();
    await screen.findByText("PlannedItem");

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(screen.getByText(visible)).toBeInTheDocument();
    ["PlannedItem", "WatchingItem", "PausedItem", "CompletedItem", "DroppedItem"]
      .filter((title) => title !== visible)
      .forEach((title) => expect(screen.queryByText(title)).not.toBeInTheDocument());
  });
});

describe("LibraryExplorer — onBrowseAll / browseAllLabel", () => {
  
  it("renders the browse-all button and calls onBrowseAll when clicked", async () => {
    const onBrowseAll = vi.fn();
    renderExplorer({ onBrowseAll, browseAllLabel: "See all movies" });

    const button = await screen.findByRole("button", { name: "See all movies" });
    fireEvent.click(button);

    expect(onBrowseAll).toHaveBeenCalledTimes(1);
  });

  it("does not render a browse-all button when onBrowseAll is not provided", async () => {
    renderExplorer({ browseAllLabel: "See all movies" });

    await screen.findByText("Dune");
    expect(screen.queryByRole("button", { name: "See all movies" })).not.toBeInTheDocument();
  });

  it("does not render a browse-all-labeled button when browseAllLabel is not provided", async () => {
    renderExplorer({ onBrowseAll: vi.fn() });

    await screen.findByText("Dune");
    expect(screen.queryByRole("button", { name: "See all movies" })).not.toBeInTheDocument();
  });

  it("does not render the browse-all button when there are no results", async () => {
    libraryQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderExplorer({ onBrowseAll: vi.fn(), browseAllLabel: "See all movies" });

    await screen.findByText("Your library is empty");
    expect(screen.queryByRole("button", { name: "See all movies" })).not.toBeInTheDocument();
  });
});

describe("LibraryExplorer — empty states", () => {
  
  it("shows the generic empty-library state with an explore-catalogue CTA when nothing matches at all", async () => {
    libraryQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(await screen.findByText("Your library is empty")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Discover movies & series" });
    expect(cta).toHaveAttribute("href", "/search");
    expect(screen.queryByText("This list is empty")).not.toBeInTheDocument();
  });

  it("shows the list-specific empty state when filtered to a list with no matching items", async () => {
    customListsState.data = [{ id: "list-empty", name: "Weekend", description: null }];
    renderPage();

    const select = await screen.findByLabelText("Filter by list");
    fireEvent.change(select, { target: { value: "list-empty" } });

    expect(await screen.findByText("This list is empty")).toBeInTheDocument();
    expect(screen.queryByText("Your library is empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Discover movies & series" })).not.toBeInTheDocument();
  });
});

describe("LibraryExplorer — remote error states", () => {
  
  it("renders a RemoteErrorState with working retry when the library query itself errors", async () => {
    const refetch = vi.fn();
    libraryQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("network down"),
      refetch,
    });
    renderPage();

    expect(await screen.findByText("Unable to load the catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders its own RemoteErrorState with working retry when the filtered list's items query errors", async () => {
    customListsState.data = [{ id: "list-err", name: "Broken list", description: null }];
    renderPage();

    const select = await screen.findByLabelText("Filter by list");
    fireEvent.change(select, { target: { value: "list-err" } });

    expect(await screen.findByText("Unable to load the catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(listItemsErrorRefetchMock).toHaveBeenCalledTimes(1);
  });
});
