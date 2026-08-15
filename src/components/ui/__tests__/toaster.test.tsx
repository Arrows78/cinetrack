import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import i18n from "@/i18n";

async function importFresh() {
  vi.resetModules();
  const [{ Toaster }, { toast }] = await Promise.all([import("../toaster"), import("../use-toast")]);
  return { Toaster, toast };
}

describe("Toaster", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when there are no toasts", async () => {
    const { Toaster } = await importFresh();
    render(<Toaster />);

    expect(screen.queryByText(/./, { selector: "[role=status], [role=alert]" })).not.toBeInTheDocument();
  });

  it("renders a toast's title and description once triggered", async () => {
    const { Toaster, toast } = await importFresh();
    render(<Toaster />);

    act(() => {
      toast({ title: "Library", description: "Saved." });
    });

    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("close button dismisses the toast", async () => {
    const { Toaster, toast } = await importFresh();
    render(<Toaster />);

    act(() => {
      toast({ description: "Dismiss me" });
    });
    expect(screen.getByText("Dismiss me")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Close" }).click();
    });

    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
  });
});
