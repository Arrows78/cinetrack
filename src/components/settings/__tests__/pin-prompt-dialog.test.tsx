import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "jest-axe";
import i18n from "@/i18n";
import { PinPromptDialog } from "../pin-prompt-dialog";

function Harness({ onVerify }: { onVerify: (pin: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open prompt
      </button>
      <PinPromptDialog open={open} profileName="Alex" onOpenChange={setOpen} onVerify={onVerify} onSuccess={vi.fn()} />
    </div>
  );
}

describe("PinPromptDialog", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("moves focus into the dialog and returns it to the opener on Escape", async () => {
    render(<Harness onVerify={vi.fn()} />);
    const opener = screen.getByRole("button", { name: "Open prompt" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("has no detectable accessibility violations, with and without the error shown", async () => {
    render(<Harness onVerify={vi.fn().mockResolvedValue(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open prompt" }));
    const dialog = await screen.findByRole("dialog");
    expect(await axe(dialog)).toHaveNoViolations();

    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByRole("alert");

    expect(await axe(dialog)).toHaveNoViolations();
  });

  it("ties the incorrect-PIN message to the field so a screen reader reads it with the input", async () => {
    render(<Harness onVerify={vi.fn().mockResolvedValue(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open prompt" }));
    const input = await screen.findByLabelText("PIN");
    fireEvent.change(input, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    const alert = await screen.findByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });

  it("logs a verification that failed outright instead of reporting it as a wrong PIN silently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<Harness onVerify={vi.fn().mockRejectedValue(new Error("ipc down"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Open prompt" }));
    fireEvent.change(await screen.findByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await screen.findByRole("alert");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ipc down"));
    warn.mockRestore();
  });
});
