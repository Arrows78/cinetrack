import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { SavedFiltersBar } from "../saved-filters-bar";

const savedFilterA = {
  id: "saved-a",
  profileId: "default",
  page: "library" as const,
  name: "Paused shows",
  filters: { statusFilter: "paused" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const createMock = vi.fn();
const renameMock = vi.fn();
const removeMock = vi.fn();
const useSavedFiltersMock = vi.fn();
vi.mock("@/features/saved-filters/use-saved-filters", () => ({
  useSavedFilters: (page: string) => useSavedFiltersMock(page),
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  createMock.mockReset().mockResolvedValue(savedFilterA);
  renameMock.mockReset().mockResolvedValue({ ...savedFilterA, name: "Renamed" });
  removeMock.mockReset().mockResolvedValue(undefined);
  useSavedFiltersMock.mockReset().mockReturnValue({
    data: [savedFilterA],
    isLoading: false,
    isError: false,
    error: null,
    create: createMock,
    rename: renameMock,
    remove: removeMock,
    isSaving: false,
  });
});

describe("SavedFiltersBar", () => {
  it("scopes the underlying query to the given page", () => {
    render(<SavedFiltersBar page="library" currentFilters={{ statusFilter: "paused" }} onApply={vi.fn()} />);
    expect(useSavedFiltersMock).toHaveBeenCalledWith("library");
  });

  it("lists saved filters and applies one when its name is clicked", () => {
    const onApply = vi.fn();
    render(<SavedFiltersBar page="library" currentFilters={{ statusFilter: "paused" }} onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Paused shows" }));
    expect(onApply).toHaveBeenCalledWith(savedFilterA.filters);
  });

  it("saves the current filters under the typed name", async () => {
    const currentFilters = { statusFilter: "watching" };
    render(<SavedFiltersBar page="library" currentFilters={currentFilters} onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.save") }));
    const input = screen.getByRole("textbox", { name: i18n.t("filters.savedFilters.nameLabel") });
    fireEvent.change(input, { target: { value: "  Currently watching  " } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.save") }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ name: "Currently watching", filters: currentFilters })
    );
    // Collapses back to the icon trigger once the save resolves, so the
    // name field (and its now-stale value) is gone rather than lingering.
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: i18n.t("filters.savedFilters.nameLabel") })).not.toBeInTheDocument()
    );
  });

  it("does not save an empty/whitespace-only name", () => {
    render(<SavedFiltersBar page="library" currentFilters={{}} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.save") }));
    expect(screen.getByRole("button", { name: i18n.t("filters.savedFilters.save") })).toBeDisabled();
  });

  it("shows a translated error and keeps the typed name when saving rejects", async () => {
    createMock.mockRejectedValueOnce(new Error("boom"));
    render(<SavedFiltersBar page="library" currentFilters={{}} onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.save") }));
    const input = screen.getByRole("textbox", { name: i18n.t("filters.savedFilters.nameLabel") });
    fireEvent.change(input, { target: { value: "My view" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.save") }));

    await waitFor(() => expect(screen.getByText(i18n.t("filters.savedFilters.saveFailed"))).toBeInTheDocument());
    expect(input).toHaveValue("My view");
  });

  it("removes a saved filter after confirming through ConfirmDialog", async () => {
    render(<SavedFiltersBar page="library" currentFilters={{}} onApply={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("filters.savedFilters.delete", { name: "Paused shows" }) })
    );
    expect(removeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.delete") }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith("saved-a"));
  });

  it("cancelling the delete ConfirmDialog does not call remove", () => {
    render(<SavedFiltersBar page="library" currentFilters={{}} onApply={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("filters.savedFilters.delete", { name: "Paused shows" }) })
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.cancel") }));

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("marks the saved filter matching the current filters as active", () => {
    render(<SavedFiltersBar page="library" currentFilters={{ statusFilter: "paused" }} onApply={vi.fn()} />);
    expect(screen.getByText(i18n.t("filters.savedFilters.active"))).toBeInTheDocument();
  });

  it("does not mark any saved filter as active when the current filters differ", () => {
    render(<SavedFiltersBar page="library" currentFilters={{ statusFilter: "watching" }} onApply={vi.fn()} />);
    expect(screen.queryByText(i18n.t("filters.savedFilters.active"))).not.toBeInTheDocument();
  });

  it("renames a saved filter under its typed name", async () => {
    render(<SavedFiltersBar page="library" currentFilters={{}} onApply={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("filters.savedFilters.rename", { name: "Paused shows" }) })
    );
    const input = screen.getByRole("textbox", { name: i18n.t("filters.savedFilters.renameLabel") });
    fireEvent.change(input, { target: { value: "  Currently paused  " } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.renameSave") }));

    await waitFor(() =>
      expect(renameMock).toHaveBeenCalledWith({ savedFilterId: "saved-a", name: "Currently paused" })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: i18n.t("filters.savedFilters.renameLabel") })
      ).not.toBeInTheDocument()
    );
  });

  it("cancelling a rename discards the typed name without saving", () => {
    render(<SavedFiltersBar page="library" currentFilters={{}} onApply={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("filters.savedFilters.rename", { name: "Paused shows" }) })
    );
    fireEvent.change(screen.getByRole("textbox", { name: i18n.t("filters.savedFilters.renameLabel") }), {
      target: { value: "Discarded" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.renameCancel") }));

    expect(renameMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Paused shows" })).toBeInTheDocument();
  });

  it("shows a translated error and keeps editing open when renaming rejects", async () => {
    renameMock.mockRejectedValueOnce(new Error("boom"));
    render(<SavedFiltersBar page="library" currentFilters={{}} onApply={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("filters.savedFilters.rename", { name: "Paused shows" }) })
    );
    fireEvent.change(screen.getByRole("textbox", { name: i18n.t("filters.savedFilters.renameLabel") }), {
      target: { value: "New name" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.savedFilters.renameSave") }));

    await waitFor(() => expect(screen.getByText(i18n.t("filters.savedFilters.renameFailed"))).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: i18n.t("filters.savedFilters.renameLabel") })).toHaveValue("New name");
  });
});
