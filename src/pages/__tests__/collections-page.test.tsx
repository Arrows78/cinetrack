import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { CollectionsPage } from "../collections-page";

vi.mock("@/components/settings/backup-tools", () => ({ BackupTools: () => <div /> }));
vi.mock("@/components/settings/tvtime-import-card", () => ({ TvTimeImportCard: () => <div /> }));

vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ user: null }) }));

let authRequired = false;
vi.mock("@/features/auth/auth-client", () => ({
  get authConfig() {
    return { required: authRequired };
  },
}));

const listProfilesMock = vi.fn();
const createProfileMock = vi.fn();
const removeProfileMock = vi.fn();
vi.mock("@/features/collections/profile-repository", () => ({
  profileRepository: {
    list: (...args: unknown[]) => listProfilesMock(...args),
    create: (...args: unknown[]) => createProfileMock(...args),
    remove: (...args: unknown[]) => removeProfileMock(...args),
  },
}));

const listCustomListsMock = vi.fn();
vi.mock("@/features/collections/custom-list-repository", () => ({
  customListRepository: { list: (...args: unknown[]) => listCustomListsMock(...args) },
}));

const setActiveProfileMock = vi.fn();
const preferencesData = {
  theme: "dark" as const,
  accentColor: "violet" as const,
  language: "en" as const,
  region: "FR",
  defaultSearchType: "all" as const,
  reduceMotion: false,
  compactMode: false,
  sidebarCollapsed: false,
  spoilerProtection: true,
  notificationsEnabled: false,
  notifyHoursBefore: 24,
  preferredProviderIds: [],
  activeProfileId: "default",
  userProfile: { id: "default", name: null },
};
vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: {
    getPreferences: () => Promise.resolve(preferencesData),
    setActiveProfile: (...args: unknown[]) => setActiveProfileMock(...args),
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<CollectionsPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("CollectionsPage — local profile management", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    authRequired = false;
    listProfilesMock.mockReset().mockResolvedValue([
      { id: "default", name: "Default", avatar: null, createdAt: "2026-01-01", supabaseUserId: null },
      { id: "alex-id", name: "Alex", avatar: null, createdAt: "2026-01-02", supabaseUserId: null },
    ]);
    createProfileMock.mockReset();
    removeProfileMock.mockReset().mockResolvedValue(undefined);
    setActiveProfileMock.mockReset().mockResolvedValue(preferencesData);
    listCustomListsMock.mockReset().mockResolvedValue([]);
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
});
