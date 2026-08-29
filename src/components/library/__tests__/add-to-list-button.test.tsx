import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { AddToListButton } from "../add-to-list-button";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

const listsState = { data: [] as Array<{ id: string; name: string }>, isLoading: false };
const addMock = vi.fn();
vi.mock("@/features/custom-lists/use-custom-lists", () => ({
  useCustomLists: () => listsState,
  useAddToCustomList: () => ({ add: addMock, isSaving: false }),
}));

describe("AddToListButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    listsState.data = [];
    addMock.mockReset().mockResolvedValue(undefined);
  });

  it("points to the library instead of disappearing when there are no lists yet", () => {
    render(<AddToListButton media={makeMedia({ id: 1, title: "Dune" })} />);

    expect(screen.getByText(/don't have any lists yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one from your library." })).toHaveAttribute("href", "/library");
  });

  it("adds the media to the selected list", () => {
    listsState.data = [{ id: "list-1", name: "Weekend" }];
    render(<AddToListButton media={makeMedia({ id: 1, title: "Dune" })} />);

    fireEvent.change(screen.getByLabelText("Custom list"), { target: { value: "list-1" } });
    screen.getByRole("button", { name: "Add to the list" }).click();

    expect(addMock).toHaveBeenCalledWith({ listId: "list-1", media: expect.objectContaining({ id: 1 }) });
  });
});
