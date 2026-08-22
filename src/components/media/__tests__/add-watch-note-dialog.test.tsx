import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { AddWatchNoteDialog } from "../add-watch-note-dialog";

describe("AddWatchNoteDialog", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders nothing when closed", () => {
    render(<AddWatchNoteDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByText("Add a note")).not.toBeInTheDocument();
  });

  it("confirms with the trimmed note text typed into the textarea", () => {
    const onConfirm = vi.fn();
    render(<AddWatchNoteDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText("Your note"), { target: { value: "  A great watch  " } });
    fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

    expect(onConfirm).toHaveBeenCalledWith("A great watch");
  });

  it("confirms with an empty string when no note was written", () => {
    const onConfirm = vi.fn();
    render(<AddWatchNoteDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("calls onOpenChange(false) when Cancel is clicked, without confirming", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(<AddWatchNoteDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clears the textarea after closing and reopening", () => {
    const { rerender } = render(<AddWatchNoteDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Your note"), { target: { value: "Draft" } });

    rerender(<AddWatchNoteDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    rerender(<AddWatchNoteDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByLabelText("Your note")).toHaveValue("");
  });
});
