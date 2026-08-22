import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { DEFAULT_SMART_LIST_RULES } from "@/features/library/smart-list-evaluation";
import type { useSmartLists } from "@/features/library/use-smart-lists";
import type { SmartList, SmartListRules } from "@/types/media";
import { SmartListsAccordionContent } from "../smart-lists-panel";

const usePreferencesMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => usePreferencesMock(),
}));

const smartList = (overrides: Partial<SmartList> = {}): SmartList => ({
  id: "sl-1",
  profileId: "default",
  name: "Cozy horror night",
  rules: {
    status: "planned",
    mediaType: "movie",
    genre: "Horror",
    maxRuntimeMinutes: 100,
    minRating: null,
    provider: "any",
    hasEpisodeWaiting: false,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function smartListsProp(overrides: Partial<ReturnType<typeof useSmartLists>> = {}): ReturnType<typeof useSmartLists> {
  return {
    data: [smartList()],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    create: vi.fn().mockResolvedValue(smartList()),
    update: vi.fn().mockResolvedValue(smartList()),
    remove: vi.fn().mockResolvedValue(undefined),
    isSaving: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSmartLists>;
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  usePreferencesMock.mockReset().mockReturnValue({ data: { preferredProviderIds: [] } });
});

describe("SmartListsAccordionContent", () => {
  it("lists existing smart lists by name", () => {
    render(
      <SmartListsAccordionContent smartLists={smartListsProp()} activeSmartListId="all" onSelectSmartList={vi.fn()} />
    );
    expect(screen.getByText("Cozy horror night")).toBeInTheDocument();
  });

  it("shows the empty state when there are no smart lists yet", () => {
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ data: [] })}
        activeSmartListId="all"
        onSelectSmartList={vi.fn()}
      />
    );
    expect(screen.getByText(i18n.t("library.smartLists.noLists"))).toBeInTheDocument();
  });

  it("shows a loading state while smart lists are loading", () => {
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ data: undefined, isLoading: true })}
        activeSmartListId="all"
        onSelectSmartList={vi.fn()}
      />
    );
    expect(screen.queryByText("Cozy horror night")).not.toBeInTheDocument();
  });

  it("shows a remote error state when loading smart lists fails", () => {
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ data: undefined, isError: true, error: new Error("boom") })}
        activeSmartListId="all"
        onSelectSmartList={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /try again|réessayer/i })).toBeInTheDocument();
  });

  it("toggles the active selection when clicking a list's name, and clears it on a second click", () => {
    const onSelectSmartList = vi.fn();
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp()}
        activeSmartListId="all"
        onSelectSmartList={onSelectSmartList}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cozy horror night" }));
    expect(onSelectSmartList).toHaveBeenCalledWith("sl-1");
  });

  it("clears the selection when clicking the already-active list", () => {
    const onSelectSmartList = vi.fn();
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp()}
        activeSmartListId="sl-1"
        onSelectSmartList={onSelectSmartList}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cozy horror night" }));
    expect(onSelectSmartList).toHaveBeenCalledWith("all");
  });

  it("disables the create button while the name is empty", () => {
    render(
      <SmartListsAccordionContent smartLists={smartListsProp()} activeSmartListId="all" onSelectSmartList={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: i18n.t("library.smartLists.create") })).toBeDisabled();
  });

  it("creates a smart list with every configured rule dimension", async () => {
    const create = vi.fn().mockResolvedValue(smartList());
    usePreferencesMock.mockReturnValue({ data: { preferredProviderIds: [8] } });
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ create })}
        activeSmartListId="all"
        onSelectSmartList={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.nameLabel")), {
      target: { value: "Weeknight picks" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.statusLabel")), {
      target: { value: "planned" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.mediaTypeLabel")), {
      target: { value: "movie" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.genreLabel")), {
      target: { value: "Horror" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.maxRuntimeLabel")), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.minRatingLabel")), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.providerLabel")), {
      target: { value: "mine" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.smartLists.hasEpisodeWaitingLabel") }));

    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.smartLists.create") }));

    const expectedRules: SmartListRules = {
      status: "planned",
      mediaType: "movie",
      genre: "Horror",
      maxRuntimeMinutes: 100,
      minRating: 8,
      provider: "mine",
      hasEpisodeWaiting: true,
    };
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Weeknight picks", rules: expectedRules }));
  });

  it("starts a fresh create form with the default (all-any) rules", () => {
    render(
      <SmartListsAccordionContent smartLists={smartListsProp()} activeSmartListId="all" onSelectSmartList={vi.fn()} />
    );
    expect(screen.getByLabelText(i18n.t("library.smartLists.statusLabel"))).toHaveValue(
      DEFAULT_SMART_LIST_RULES.status
    );
    expect(screen.getByLabelText(i18n.t("library.smartLists.mediaTypeLabel"))).toHaveValue(
      DEFAULT_SMART_LIST_RULES.mediaType
    );
  });

  it("edit populates the form with the list's existing name and rules, and update saves it", async () => {
    const update = vi.fn().mockResolvedValue(smartList());
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ update })}
        activeSmartListId="all"
        onSelectSmartList={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("library.smartLists.edit", { name: "Cozy horror night" }) })
    );

    expect(screen.getByLabelText(i18n.t("library.smartLists.nameLabel"))).toHaveValue("Cozy horror night");
    expect(screen.getByLabelText(i18n.t("library.smartLists.genreLabel"))).toHaveValue("Horror");
    expect(screen.getByRole("button", { name: i18n.t("library.smartLists.save") })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.nameLabel")), {
      target: { value: "Renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.smartLists.save") }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        id: "sl-1",
        name: "Renamed",
        rules: smartList().rules,
      })
    );
  });

  it("cancelling an edit returns to the create form", () => {
    render(
      <SmartListsAccordionContent smartLists={smartListsProp()} activeSmartListId="all" onSelectSmartList={vi.fn()} />
    );

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("library.smartLists.edit", { name: "Cozy horror night" }) })
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.smartLists.cancel") }));

    expect(screen.getByRole("button", { name: i18n.t("library.smartLists.create") })).toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t("library.smartLists.nameLabel"))).toHaveValue("");
  });

  it("removes a smart list after confirming through ConfirmDialog, and clears the active selection if it was selected", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const onSelectSmartList = vi.fn();
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ remove })}
        activeSmartListId="sl-1"
        onSelectSmartList={onSelectSmartList}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("library.smartLists.delete", { name: "Cozy horror night" }) })
    );
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.confirm") }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("sl-1"));
    await waitFor(() => expect(onSelectSmartList).toHaveBeenCalledWith("all"));
  });

  it("cancelling the delete confirmation does not call remove", () => {
    const remove = vi.fn();
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ remove })}
        activeSmartListId="all"
        onSelectSmartList={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("library.smartLists.delete", { name: "Cozy horror night" }) })
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.cancel") }));

    expect(remove).not.toHaveBeenCalled();
  });

  it("shows a translated error and keeps the form when creating fails", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("boom"));
    render(
      <SmartListsAccordionContent
        smartLists={smartListsProp({ create })}
        activeSmartListId="all"
        onSelectSmartList={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(i18n.t("library.smartLists.nameLabel")), {
      target: { value: "My list" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("library.smartLists.create") }));

    await waitFor(() => expect(screen.getByText(i18n.t("desktop.operationFailed"))).toBeInTheDocument());
  });
});
