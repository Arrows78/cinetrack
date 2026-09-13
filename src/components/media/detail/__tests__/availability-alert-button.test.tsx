import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { AvailabilityAlertButton } from "../availability-alert-button";
import type { MediaSummary } from "@/types/media";

const useAvailabilityAlertMock = vi.fn();
vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilityAlert: (...args: unknown[]) => useAvailabilityAlertMock(...args),
}));

const usePreferencesMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => usePreferencesMock(),
}));

const requestPermissionMock = vi.fn();
vi.mock("@/features/desktop", () => ({
  notificationService: { requestPermission: (...args: unknown[]) => requestPermissionMock(...args) },
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const media: MediaSummary = {
  id: 1,
  mediaType: "movie",
  title: "Dune",
  overview: "",
  genres: [],
  cast: [],
};

const toggleMock = vi.fn();

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  useAvailabilityAlertMock.mockReset().mockReturnValue({ data: null, toggle: toggleMock, isSaving: false });
  usePreferencesMock.mockReset().mockReturnValue({ data: { region: "FR", preferredProviderIds: [] } });
  requestPermissionMock.mockReset().mockResolvedValue(true);
  toastMock.mockReset();
  toggleMock.mockReset().mockResolvedValue(undefined);
});

describe("AvailabilityAlertButton", () => {
  it("creates the alert directly when notifications are already permitted", async () => {
    render(<AvailabilityAlertButton media={media} />);

    fireEvent.click(screen.getByRole("button", { name: "Availability alert" }));

    await waitFor(() => expect(toggleMock).toHaveBeenCalledTimes(1));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("shows a translated error and never toggles the alert when notification permission is denied", async () => {
    requestPermissionMock.mockResolvedValue(false);
    render(<AvailabilityAlertButton media={media} />);

    fireEvent.click(screen.getByRole("button", { name: "Availability alert" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: i18n.t("availability.notificationPermissionDenied") })
      )
    );
    expect(toggleMock).not.toHaveBeenCalled();
  });

  it("does not re-request permission to disable an already-enabled alert", async () => {
    useAvailabilityAlertMock.mockReturnValue({ data: { id: "alert-1" }, toggle: toggleMock, isSaving: false });
    render(<AvailabilityAlertButton media={media} />);

    fireEvent.click(screen.getByRole("button", { name: "Disable alert" }));

    await waitFor(() => expect(toggleMock).toHaveBeenCalledTimes(1));
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});
