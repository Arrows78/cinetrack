import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";

const preferencesMock = vi.fn();
const updatePreferenceMock = vi.fn();

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => preferencesMock(),
}));

import { HideWatchedToggle } from "@/components/media/hide-watched-toggle";

describe("HideWatchedToggle", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    preferencesMock.mockReset();
    updatePreferenceMock.mockReset();
  });

  it("renders unpressed when the preference is off (or not loaded yet)", () => {
    preferencesMock.mockReturnValue({
      data: undefined,
      updatePreference: updatePreferenceMock,
      isSaving: false,
      isLoading: false,
    });

    render(<HideWatchedToggle />);

    expect(screen.getByRole("button", { name: /hide watched/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders pressed when hideWatchedInDiscovery is already on", () => {
    preferencesMock.mockReturnValue({
      data: { hideWatchedInDiscovery: true },
      updatePreference: updatePreferenceMock,
      isSaving: false,
      isLoading: false,
    });

    render(<HideWatchedToggle />);

    expect(screen.getByRole("button", { name: /hide watched/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("flips the persistent preference (not just local state) when clicked", () => {
    preferencesMock.mockReturnValue({
      data: { hideWatchedInDiscovery: false },
      updatePreference: updatePreferenceMock,
      isSaving: false,
      isLoading: false,
    });

    render(<HideWatchedToggle />);
    fireEvent.click(screen.getByRole("button", { name: /hide watched/i }));

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "hideWatchedInDiscovery", value: true });
  });

  it("toggles back off when already on", () => {
    preferencesMock.mockReturnValue({
      data: { hideWatchedInDiscovery: true },
      updatePreference: updatePreferenceMock,
      isSaving: false,
      isLoading: false,
    });

    render(<HideWatchedToggle />);
    fireEvent.click(screen.getByRole("button", { name: /hide watched/i }));

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "hideWatchedInDiscovery", value: false });
  });

  it("disables the control while saving so a double-click can't fire two writes", () => {
    preferencesMock.mockReturnValue({
      data: { hideWatchedInDiscovery: false },
      updatePreference: updatePreferenceMock,
      isSaving: true,
      isLoading: false,
    });

    render(<HideWatchedToggle />);

    expect(screen.getByRole("button", { name: /hide watched/i })).toBeDisabled();
  });
});
