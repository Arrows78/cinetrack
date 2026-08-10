import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialog } from "../confirm-dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this?"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => setOpen(false)}
      />
    </div>
  );
}

describe("ConfirmDialog", () => {
  it("focuses the cancel button on open and closes on Escape", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByText("Open"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // No autofocus is suppressed — Radix's default lands focus on the
    // first focusable element in the dialog, the Cancel button, rather
    // than leaving focus stuck behind the overlay.
    await waitFor(() => expect(screen.getByText("Cancel")).toHaveFocus());

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("calls onConfirm when the confirm button is activated", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title="Delete this?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
