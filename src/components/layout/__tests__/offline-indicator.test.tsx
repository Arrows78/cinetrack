import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import i18n from "@/i18n";
import { OfflineIndicator } from "../offline-indicator";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("OfflineIndicator", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("renders nothing while navigator.onLine is true at mount", () => {
    render(<OfflineIndicator />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the banner when an offline event fires, and hides it again on online", async () => {
    render(<OfflineIndicator />);

    window.dispatchEvent(new Event("offline"));

    const banner = await screen.findByRole("status");
    expect(banner).toHaveAttribute("aria-atomic", "true");

    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("removes its online/offline listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<OfflineIndicator />);
    unmount();

    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    removeSpy.mockRestore();
  });

  it("does not throw or update state after unmount when events still fire", () => {
    const { unmount } = render(<OfflineIndicator />);
    unmount();

    expect(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    }).not.toThrow();
  });
});
