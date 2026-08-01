import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { BrowserPreviewBanner } from "../browser-preview-banner";

const isTauriApp = vi.fn(() => false);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriApp() }));

describe("BrowserPreviewBanner", () => {
  it("shows a non-blocking hint outside Tauri", () => {
    isTauriApp.mockReturnValue(false);

    render(<BrowserPreviewBanner />);

    expect(screen.getByText(/SQLite/)).toBeInTheDocument();
  });

  it("renders nothing inside the Tauri webview", () => {
    isTauriApp.mockReturnValue(true);

    const { container } = render(<BrowserPreviewBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
