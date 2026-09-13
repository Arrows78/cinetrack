import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ExportPreviewDialog } from "../export-preview-dialog";

const isMobileAppMock = vi.fn();
vi.mock("@/shared/lib/platform", () => ({
  isMobileApp: () => isMobileAppMock(),
}));

describe("ExportPreviewDialog", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    isMobileAppMock.mockReset().mockReturnValue(false);
  });

  it("renders nothing when closed", () => {
    render(
      <ExportPreviewDialog open={false} onOpenChange={vi.fn()} title="Preview" imageUrl={null} onConfirm={vi.fn()} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a loading placeholder (no image, confirm disabled) while the card is still rendering", () => {
    render(
      <ExportPreviewDialog open onOpenChange={vi.fn()} title="Preview" imageUrl={null} onConfirm={vi.fn()} />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("shows the rendered image and an enabled confirm button once imageUrl is set", () => {
    render(
      <ExportPreviewDialog
        open
        onOpenChange={vi.fn()}
        title="Preview"
        imageUrl="blob:mock-url"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute("src", "blob:mock-url");
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });

  it("shows a Share confirm label on mobile instead of Download", () => {
    isMobileAppMock.mockReturnValue(true);
    render(
      <ExportPreviewDialog open onOpenChange={vi.fn()} title="Preview" imageUrl="blob:mock-url" onConfirm={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ExportPreviewDialog
        open
        onOpenChange={vi.fn()}
        title="Preview"
        imageUrl="blob:mock-url"
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <ExportPreviewDialog
        open
        onOpenChange={onOpenChange}
        title="Preview"
        imageUrl="blob:mock-url"
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Cancel and shows a loading confirm button while isConfirming", () => {
    render(
      <ExportPreviewDialog
        open
        onOpenChange={vi.fn()}
        title="Preview"
        imageUrl="blob:mock-url"
        onConfirm={vi.fn()}
        isConfirming
      />
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download" })).toHaveAttribute("aria-busy", "true");
  });

  it("lets escape close the dialog when not confirming", () => {
    const onOpenChange = vi.fn();
    render(
      <ExportPreviewDialog
        open
        onOpenChange={onOpenChange}
        title="Preview"
        imageUrl="blob:mock-url"
        onConfirm={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not let the overlay/escape close the dialog while isConfirming", () => {
    const onOpenChange = vi.fn();
    render(
      <ExportPreviewDialog
        open
        onOpenChange={onOpenChange}
        title="Preview"
        imageUrl="blob:mock-url"
        onConfirm={vi.fn()}
        isConfirming
      />
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
