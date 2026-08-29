import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { LibraryEditor } from "../library-editor";
import type { MediaSummary } from "@/types/media";

const save = vi.fn(() => Promise.resolve());
const refetch = vi.fn();
const useLibraryItemMock = vi.fn();

vi.mock("@/features/library/use-library", () => ({
  useLibraryItem: () => useLibraryItemMock(),
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

// LibraryEditor now renders AddToListButton inline (see the "within the
// library panel" fix) — stub the lists it reads so this suite stays focused
// on the save/remove form instead of also exercising list data.
vi.mock("@/features/custom-lists/custom-list-repository", () => ({
  customListRepository: { list: () => Promise.resolve([]) },
}));

// AddToListButton's no-lists-yet state links to /library — no RouterProvider
// exists in this render, same workaround as media-card.test.tsx's own mock.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
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

// AddToListButton (rendered inline once the entry has loaded, see below)
// reads real react-query hooks — only that render path needs a QueryClient.
function renderLoaded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<LibraryEditor media={media} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("LibraryEditor", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    save.mockReset();
    refetch.mockReset();
    useLibraryItemMock.mockReset();
    toastMock.mockReset();
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

    renderLoaded();

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

  it("renders the add-to-list control inside the same library panel", () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    const { container } = renderLoaded();

    // Both live inside the editor's single top-level Panel — this used to be
    // a separate, unlabeled control rendered below it instead.
    const panel = container.firstElementChild;
    expect(panel).toHaveTextContent("Add to a list");
    expect(panel).toHaveTextContent("Save");
  });

  it("keeps the add-to-list section collapsed until the user opens it", async () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();

    expect(screen.queryByText(/don't have any lists yet/i)).not.toBeInTheDocument();

    screen.getByRole("button", { name: "Add to a list" }).click();

    expect(await screen.findByText(/don't have any lists yet/i)).toBeInTheDocument();
  });

  it("shows a success toast once the save resolves", async () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    screen.getByRole("button", { name: /save/i }).click();

    await vi.waitFor(() => expect(toastMock).toHaveBeenCalledWith({ description: "Saved.", variant: "success" }));
  });

  it("shows an error toast, never the raw error message, when saving fails", async () => {
    save.mockReset().mockRejectedValueOnce(new Error("sql.execute not allowed"));
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    screen.getByRole("button", { name: /save/i }).click();

    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ description: "Couldn't save. Please try again.", variant: "error" })
    );
  });

  it("toggles favourite and sends the new value on save", () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem, // favourite: true
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Favourite" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ favourite: false }));
  });

  it("changes the status and sends the new value on save", () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem, // status: "watching"
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
    screen.getByRole("button", { name: /save/i }).click();

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("clamps an out-of-range rating into 0..10 on save", () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    fireEvent.change(screen.getByLabelText("My rating / 10"), { target: { value: "42" } });
    screen.getByRole("button", { name: /save/i }).click();

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ userRating: 10 }));
  });

  it("floors a negative rewatch count to 0 on save", () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    fireEvent.change(screen.getByLabelText("Rewatches"), { target: { value: "-3" } });
    screen.getByRole("button", { name: /save/i }).click();

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ rewatchCount: 0 }));
  });

  it("trims and splits the tags field, and edits private notes, sending both on save", () => {
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    fireEvent.change(screen.getByPlaceholderText("family, sci-fi, sunday"), {
      target: { value: " comfort watch ,  rewatch , " },
    });
    fireEvent.change(screen.getByLabelText("Private notes"), { target: { value: "   " } });
    screen.getByRole("button", { name: /save/i }).click();

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ tags: ["comfort watch", "rewatch"], notes: null }));
  });

  it("renders the form with no Remove button for a title that isn't in the library yet", () => {
    useLibraryItemMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();

    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("sends a null rating and null notes when the loaded entry has neither and they're left untouched", () => {
    useLibraryItemMock.mockReturnValue({
      data: { ...libraryItem, userRating: null, notes: null },
      isLoading: false,
      isError: false,
      save,
      remove: vi.fn(),
      isSaving: false,
      refetch,
    });

    renderLoaded();
    screen.getByRole("button", { name: /save/i }).click();

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ userRating: null, notes: null }));
  });

  it("removes the entry from the library once removal is confirmed", async () => {
    const remove = vi.fn();
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove,
      isSaving: false,
      refetch,
    });

    renderLoaded();
    screen.getByRole("button", { name: /remove/i }).click();

    const dialogConfirm = await screen.findByRole("button", { name: "Confirm" });
    expect(remove).not.toHaveBeenCalled();
    dialogConfirm.click();

    expect(remove).toHaveBeenCalled();
  });

  it("keeps the entry when removal is canceled", async () => {
    const remove = vi.fn();
    useLibraryItemMock.mockReturnValue({
      data: libraryItem,
      isLoading: false,
      isError: false,
      save,
      remove,
      isSaving: false,
      refetch,
    });

    renderLoaded();
    screen.getByRole("button", { name: /remove/i }).click();

    const dialogCancel = await screen.findByRole("button", { name: "Cancel" });
    dialogCancel.click();

    expect(remove).not.toHaveBeenCalled();
  });
});
