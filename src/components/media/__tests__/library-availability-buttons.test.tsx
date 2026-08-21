import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { AddToLibraryButton } from "../add-to-library-button";
import { AvailabilityAlertButton } from "../availability-alert-button";

const useIsInLibraryMock = vi.fn();
const addPlannedMock = vi.fn();
const removeIfPlannedMock = vi.fn();
const forceRemoveMock = vi.fn();
const libraryStateMock = { isSaving: false };

vi.mock("@/features/library/use-library", () => ({
  useIsInLibrary: (...args: unknown[]) => useIsInLibraryMock(...args),
  useLibraryQuickToggle: () => ({
    addPlanned: addPlannedMock,
    removeIfPlanned: removeIfPlannedMock,
    forceRemove: forceRemoveMock,
    isSaving: libraryStateMock.isSaving,
  }),
}));

const useAvailabilityAlertMock = vi.fn();
vi.mock("@/features/availability/use-availability-alerts", () => ({
  useAvailabilityAlert: (...args: unknown[]) => useAvailabilityAlertMock(...args),
}));

const usePreferencesMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: (...args: unknown[]) => usePreferencesMock(...args),
}));

const requestPermissionMock = vi.fn();
vi.mock("@/features/desktop/notification-service", () => ({
  notificationService: {
    requestPermission: (...args: unknown[]) => requestPermissionMock(...args),
  },
}));

describe("AddToLibraryButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useIsInLibraryMock.mockReset().mockReturnValue({ data: false });
    addPlannedMock.mockReset().mockResolvedValue(undefined);
    removeIfPlannedMock.mockReset().mockResolvedValue(true);
    forceRemoveMock.mockReset().mockResolvedValue(undefined);
    libraryStateMock.isSaving = false;
  });

  it("shows a default-variant add action when not in library and calls addPlanned on click", async () => {
    useIsInLibraryMock.mockReturnValue({ data: false });
    const media = makeMedia({ id: 7, mediaType: "movie" });
    render(<AddToLibraryButton media={media} />);

    const button = screen.getByRole("button", { name: "Add to library" });
    // default variant carries the primary-background classes, not secondary's.
    expect(button.className).toContain("bg-primary");
    expect(button.className).not.toContain("bg-secondary");

    button.click();

    await waitFor(() => expect(addPlannedMock).toHaveBeenCalledWith(media));
    expect(removeIfPlannedMock).not.toHaveBeenCalled();
  });

  it("shows a secondary-variant in-library action, and a plain toggle click removes silently when allowed", async () => {
    useIsInLibraryMock.mockReturnValue({ data: true });
    removeIfPlannedMock.mockResolvedValue(true);
    const media = makeMedia({ id: 7, mediaType: "movie" });
    render(<AddToLibraryButton media={media} />);

    const button = screen.getByRole("button", { name: "In library" });
    expect(button.className).toContain("bg-secondary");

    button.click();

    await waitFor(() => expect(removeIfPlannedMock).toHaveBeenCalledWith({ mediaId: 7, mediaType: "movie" }));
    // Actually removed (truthy resolve) — no need to fall back to the confirm dialog.
    expect(screen.queryByText("Remove this title from your library?")).not.toBeInTheDocument();
    expect(forceRemoveMock).not.toHaveBeenCalled();
  });

  it("opens the confirm dialog when removeIfPlanned is blocked by real progress, and confirming forces the removal", async () => {
    useIsInLibraryMock.mockReturnValue({ data: true });
    removeIfPlannedMock.mockResolvedValue(false);
    const media = makeMedia({ id: 7, mediaType: "movie" });
    render(<AddToLibraryButton media={media} />);

    const button = screen.getByRole("button", { name: "In library" });
    button.click();

    await waitFor(() => expect(removeIfPlannedMock).toHaveBeenCalledWith({ mediaId: 7, mediaType: "movie" }));
    expect(await screen.findByText("Remove this title from your library?")).toBeInTheDocument();

    screen.getByRole("button", { name: "Confirm" }).click();

    await waitFor(() => expect(forceRemoveMock).toHaveBeenCalledWith({ mediaId: 7, mediaType: "movie" }));
    expect(screen.queryByText("Remove this title from your library?")).not.toBeInTheDocument();
  });

  it("disables the button while isSaving is true", () => {
    useIsInLibraryMock.mockReturnValue({ data: false });
    libraryStateMock.isSaving = true;
    render(<AddToLibraryButton media={makeMedia({ id: 7 })} />);

    expect(screen.getByRole("button", { name: "Add to library" })).toBeDisabled();
  });
});

describe("AvailabilityAlertButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useAvailabilityAlertMock.mockReset().mockReturnValue({ data: null, isSaving: false, toggle: vi.fn() });
    usePreferencesMock.mockReset().mockReturnValue({ data: undefined });
    requestPermissionMock.mockReset().mockResolvedValue(true);
  });

  it("requests permission before enabling a new alert, and toggles when granted", async () => {
    const toggle = vi.fn().mockResolvedValue(undefined);
    useAvailabilityAlertMock.mockReturnValue({ data: null, isSaving: false, toggle });
    requestPermissionMock.mockResolvedValue(true);
    render(<AvailabilityAlertButton media={makeMedia({ id: 7 })} />);

    screen.getByRole("button", { name: "Availability alert" }).click();

    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalled());
    await waitFor(() => expect(toggle).toHaveBeenCalled());
  });

  it("does not toggle when permission is denied", async () => {
    const toggle = vi.fn();
    useAvailabilityAlertMock.mockReturnValue({ data: null, isSaving: false, toggle });
    requestPermissionMock.mockResolvedValue(false);
    render(<AvailabilityAlertButton media={makeMedia({ id: 7 })} />);

    screen.getByRole("button", { name: "Availability alert" }).click();

    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalled());
    expect(toggle).not.toHaveBeenCalled();
  });

  it("skips the permission check and shows the disable label when an alert already exists", async () => {
    const toggle = vi.fn().mockResolvedValue(undefined);
    useAvailabilityAlertMock.mockReturnValue({
      data: { id: "alert-1" },
      isSaving: false,
      toggle,
    });
    render(<AvailabilityAlertButton media={makeMedia({ id: 7 })} />);

    const button = screen.getByRole("button", { name: "Disable alert" });
    expect(button.className).toContain("bg-secondary");

    button.click();

    await waitFor(() => expect(toggle).toHaveBeenCalled());
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it("shows a loading, disabled state while isSaving is true", () => {
    useAvailabilityAlertMock.mockReturnValue({ data: null, isSaving: true, toggle: vi.fn() });
    render(<AvailabilityAlertButton media={makeMedia({ id: 7 })} />);

    const button = screen.getByRole("button", { name: "Availability alert" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("passes preferences region/providers through to useAvailabilityAlert, falling back to defaults when absent", () => {
    usePreferencesMock.mockReturnValue({ data: undefined });
    const media = makeMedia({ id: 7 });
    render(<AvailabilityAlertButton media={media} />);

    expect(useAvailabilityAlertMock).toHaveBeenCalledWith(media, "US", []);

    useAvailabilityAlertMock.mockClear();
    usePreferencesMock.mockReturnValue({ data: { region: "FR", preferredProviderIds: [8, 9] } });
    render(<AvailabilityAlertButton media={media} />);

    expect(useAvailabilityAlertMock).toHaveBeenCalledWith(media, "FR", [8, 9]);
  });
});
