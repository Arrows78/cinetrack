import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SettingsPage } from "../settings-page";

vi.mock("@/components/settings/backup-tools", () => ({ BackupTools: () => <div /> }));
vi.mock("@/components/settings/tvtime-import-card", () => ({ TvTimeImportCard: () => <div /> }));
vi.mock("@/components/settings/desktop-settings", () => ({ DesktopSettings: () => <div /> }));

let currentUser: { email: string } | null = null;
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ user: currentUser }) }));

let authRequired = false;
vi.mock("@/features/auth/auth-client", () => ({
  get authConfig() {
    return { required: authRequired };
  },
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const requestPermissionMock = vi.fn();
vi.mock("@/features/desktop/notification-service", () => ({
  notificationService: {
    requestPermission: (...args: unknown[]) => requestPermissionMock(...args),
  },
}));

const listProfilesMock = vi.fn();
const createProfileMock = vi.fn();
const removeProfileMock = vi.fn();
vi.mock("@/features/profiles/profile-repository", () => ({
  profileRepository: {
    list: (...args: unknown[]) => listProfilesMock(...args),
    create: (...args: unknown[]) => createProfileMock(...args),
    remove: (...args: unknown[]) => removeProfileMock(...args),
  },
}));

const setActiveProfileMock = vi.fn();
const getPreferencesMock = vi.fn();
const updatePreferenceMock = vi.fn();
const preferencesData = {
  theme: "dark" as const,
  accentColor: "violet" as const,
  language: "en" as const,
  region: "FR",
  defaultSearchType: "all" as const,
  reduceMotion: false,
  compactMode: false,
  sidebarCollapsed: false,
  libraryViewMode: "grid",
  spoilerProtection: true,
  notificationsEnabled: false,
  notifyHoursBefore: 24,
  preferredProviderIds: [],
  activeProfileId: "default",
  userProfile: { id: "default", name: null },
};
vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: {
    getPreferences: (...args: unknown[]) => getPreferencesMock(...args),
    setActiveProfile: (...args: unknown[]) => setActiveProfileMock(...args),
    updatePreference: (...args: unknown[]) => updatePreferenceMock(...args),
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<SettingsPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("SettingsPage — local profile management", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    authRequired = false;
    currentUser = null;
    listProfilesMock.mockReset().mockResolvedValue([
      { id: "default", name: "Default", avatar: null, createdAt: "2026-01-01", supabaseUserId: null },
      { id: "alex-id", name: "Alex", avatar: null, createdAt: "2026-01-02", supabaseUserId: null },
    ]);
    createProfileMock.mockReset();
    removeProfileMock.mockReset().mockResolvedValue(undefined);
    setActiveProfileMock.mockReset().mockResolvedValue(preferencesData);
    getPreferencesMock.mockReset().mockResolvedValue(preferencesData);
    updatePreferenceMock.mockReset().mockResolvedValue(preferencesData);
    toastMock.mockReset();
    requestPermissionMock.mockReset().mockResolvedValue(true);
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("offline mode: lists every local profile with the active one marked, and can switch", async () => {
    renderPage();

    expect(await screen.findByText("Default profile")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();

    screen.getByText("Alex").click();

    await waitFor(() => expect(setActiveProfileMock).toHaveBeenCalledWith("alex-id"));
  });

  it("offline mode: creates a new unclaimed profile from the inline form", async () => {
    createProfileMock.mockResolvedValueOnce({
      id: "new-id",
      name: "Sam",
      avatar: null,
      createdAt: "2026-01-03",
      supabaseUserId: null,
    });
    renderPage();
    await screen.findByText("Default profile");

    const input = screen.getByLabelText("New profile name");
    fireEvent.change(input, { target: { value: "Sam" } });

    const createButton = screen.getByRole("button", { name: "Create profile" });
    await waitFor(() => expect(createButton).toBeEnabled());
    createButton.click();

    await waitFor(() => expect(createProfileMock).toHaveBeenCalledWith("Sam"));
  });

  it("offline mode: the default profile has no delete button, but others do", async () => {
    renderPage();
    await screen.findByText("Default profile");

    expect(screen.queryByRole("button", { name: "Delete profile Default profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete profile Alex" })).toBeInTheDocument();
  });

  it("offline mode: deleting a profile goes through ConfirmDialog before calling remove", async () => {
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Delete profile Alex" }).click();

    const dialogConfirm = await screen.findByRole("button", { name: "Confirm" });
    expect(removeProfileMock).not.toHaveBeenCalled();
    dialogConfirm.click();

    await waitFor(() => expect(removeProfileMock).toHaveBeenCalledWith("alex-id"));
  });

  it("auth-required mode: shows only the active profile, read-only, no switcher", async () => {
    authRequired = true;
    renderPage();

    expect(await screen.findByText("Default profile")).toBeInTheDocument();
    expect(screen.queryByText("Alex")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New profile name")).not.toBeInTheDocument();
  });

  it("auth-required mode: shows the linked email for a non-default active profile", async () => {
    authRequired = true;
    currentUser = { email: "alex@example.com" };
    getPreferencesMock.mockReset().mockResolvedValue({ ...preferencesData, activeProfileId: "alex-id" });
    renderPage();

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Linked to alex@example.com")).toBeInTheDocument();
  });

  it("offline mode: canceling the delete confirmation never calls remove", async () => {
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Delete profile Alex" }).click();
    const cancelButton = await screen.findByRole("button", { name: "Cancel" });
    cancelButton.click();

    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument());
    expect(removeProfileMock).not.toHaveBeenCalled();
  });

  it("offline mode: shows an error toast when removing a profile fails", async () => {
    removeProfileMock.mockReset().mockRejectedValueOnce(new Error("boom"));
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Delete profile Alex" }).click();
    (await screen.findByRole("button", { name: "Confirm" })).click();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        description: "Couldn't delete the profile. Please try again.",
        variant: "error",
      })
    );
  });

  it("offline mode: shows an error toast when switching profiles fails", async () => {
    setActiveProfileMock.mockReset().mockRejectedValueOnce(new Error("boom"));
    renderPage();
    await screen.findByText("Default profile");

    screen.getByText("Alex").click();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        description: "Couldn't switch profiles. Please try again.",
        variant: "error",
      })
    );
  });

  it("offline mode: shows an error toast when creating a profile fails", async () => {
    createProfileMock.mockReset().mockRejectedValueOnce(new Error("boom"));
    renderPage();
    await screen.findByText("Default profile");

    const input = screen.getByLabelText("New profile name");
    fireEvent.change(input, { target: { value: "Sam" } });
    const createButton = screen.getByRole("button", { name: "Create profile" });
    await waitFor(() => expect(createButton).toBeEnabled());
    createButton.click();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        description: "Couldn't create the profile. Please try again.",
        variant: "error",
      })
    );
  });

  it("offline mode: shows a remote-error state with retry when profiles fail to load", async () => {
    listProfilesMock.mockReset().mockRejectedValue(new Error("sqlite unavailable"));
    renderPage();

    const retryButton = await screen.findByRole("button", { name: "Try again" });
    expect(listProfilesMock).toHaveBeenCalledTimes(1);

    retryButton.click();
    await waitFor(() => expect(listProfilesMock).toHaveBeenCalledTimes(2));
  });
});

describe("SettingsPage — preferences", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    authRequired = false;
    listProfilesMock.mockReset().mockResolvedValue([
      { id: "default", name: "Default", avatar: null, createdAt: "2026-01-01", supabaseUserId: null },
    ]);
    getPreferencesMock.mockReset().mockResolvedValue(preferencesData);
    updatePreferenceMock.mockReset().mockResolvedValue(preferencesData);
    toastMock.mockReset();
    requestPermissionMock.mockReset().mockResolvedValue(true);
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows a remote-error state when preferences fail to load", async () => {
    getPreferencesMock.mockReset().mockRejectedValue(new Error("sqlite unavailable"));
    renderPage();

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("changes the accent color when a swatch is clicked", async () => {
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Blue" }).click();

    await waitFor(() =>
      expect(updatePreferenceMock).toHaveBeenCalledWith("accentColor", "blue")
    );
  });

  it("updates the language preference and the active i18n language", async () => {
    renderPage();
    await screen.findByText("Default profile");

    const languageSelect = screen.getByRole("combobox", { name: "Language" });
    fireEvent.change(languageSelect, { target: { value: "fr" } });

    await waitFor(() => expect(updatePreferenceMock).toHaveBeenCalledWith("language", "fr"));
    await waitFor(() => expect(i18n.language).toBe("fr"));
  });

  it("updates the TMDB region preference", async () => {
    renderPage();
    await screen.findByText("Default profile");

    const regionSelect = screen.getByRole("combobox", { name: "TMDB Region" });
    fireEvent.change(regionSelect, { target: { value: "US" } });

    await waitFor(() => expect(updatePreferenceMock).toHaveBeenCalledWith("region", "US"));
  });

  it("updates the default search type from the filter bar", async () => {
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Series" }).click();

    await waitFor(() =>
      expect(updatePreferenceMock).toHaveBeenCalledWith("defaultSearchType", "series")
    );
  });

  it("toggles reduce-motion, compact mode and spoiler protection", async () => {
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Reduce animations" }).click();
    await waitFor(() =>
      expect(updatePreferenceMock).toHaveBeenCalledWith("reduceMotion", true)
    );

    screen.getByRole("button", { name: "Compact mode" }).click();
    await waitFor(() =>
      expect(updatePreferenceMock).toHaveBeenCalledWith("compactMode", true)
    );

    screen.getByRole("button", { name: "Spoiler protection" }).click();
    await waitFor(() =>
      // preferencesData starts with spoilerProtection: true, so toggling flips it off.
      expect(updatePreferenceMock).toHaveBeenCalledWith("spoilerProtection", false)
    );
  });

  it("enables calendar notifications once permission is granted", async () => {
    requestPermissionMock.mockResolvedValue(true);
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Calendar notifications" }).click();

    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(updatePreferenceMock).toHaveBeenCalledWith("notificationsEnabled", true)
    );
  });

  it("does not enable calendar notifications when permission is refused", async () => {
    requestPermissionMock.mockResolvedValue(false);
    renderPage();
    await screen.findByText("Default profile");

    screen.getByRole("button", { name: "Calendar notifications" }).click();

    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalled());
    expect(updatePreferenceMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "notificationsEnabled" })
    );
  });
});
