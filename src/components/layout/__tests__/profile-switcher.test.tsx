import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { ProfileSwitcher } from "../profile-switcher";

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

const warnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({ logger: { warn: (...args: unknown[]) => warnMock(...args) } }));

const listProfilesMock = vi.fn();
vi.mock("@/features/profiles/profile-repository", () => ({
  profileRepository: {
    list: (...args: unknown[]) => listProfilesMock(...args),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

const setActiveProfileMock = vi.fn();
const getPreferencesMock = vi.fn();
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
    updatePreference: vi.fn(),
  },
}));

function renderSwitcher(props: Partial<Parameters<typeof ProfileSwitcher>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<ProfileSwitcher {...props} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("ProfileSwitcher", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    authRequired = false;
    currentUser = null;
    listProfilesMock.mockReset().mockResolvedValue([
      { id: "default", name: "Default", avatar: null, createdAt: "2026-01-01", supabaseUserId: null },
      { id: "alex-id", name: "Alex", avatar: null, createdAt: "2026-01-02", supabaseUserId: null },
    ]);
    getPreferencesMock.mockReset().mockResolvedValue(preferencesData);
    setActiveProfileMock.mockReset().mockResolvedValue(preferencesData);
    toastMock.mockReset();
    warnMock.mockReset();
  });

  it("shows the active profile's initial and name on the trigger", async () => {
    renderSwitcher();

    expect(await screen.findByText("D")).toBeInTheDocument();
    expect(screen.getByText("Default profile")).toBeInTheDocument();
  });

  it("hides the visible name when collapsed, keeping the trigger reachable by accessible name", async () => {
    renderSwitcher({ collapsed: true });

    expect(await screen.findByRole("button", { name: "Switch profile" })).toBeInTheDocument();
    expect(screen.queryByText("Default profile")).not.toBeInTheDocument();
  });

  it("offline mode: opens the sheet and switches to another local profile", async () => {
    renderSwitcher();
    fireEvent.click(await screen.findByRole("button", { name: "Switch profile" }));

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Alex"));

    await waitFor(() => expect(setActiveProfileMock).toHaveBeenCalledWith("alex-id"));
  });

  it("offline mode: marks the current profile active and disables switching into it", async () => {
    renderSwitcher();
    fireEvent.click(await screen.findByRole("button", { name: "Switch profile" }));

    await screen.findByText("Alex");
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("offline mode: shows an error toast when switching fails", async () => {
    setActiveProfileMock.mockReset().mockRejectedValueOnce(new Error("boom"));
    renderSwitcher();
    fireEvent.click(await screen.findByRole("button", { name: "Switch profile" }));

    fireEvent.click(await screen.findByText("Alex"));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        description: "Couldn't switch profiles. Please try again.",
        variant: "error",
      })
    );
  });

  it("auth-required mode: shows only the current profile, read-only, no switch targets", async () => {
    authRequired = true;
    currentUser = { email: "alex@example.com" };
    getPreferencesMock.mockReset().mockResolvedValue({ ...preferencesData, activeProfileId: "alex-id" });
    renderSwitcher();

    fireEvent.click(await screen.findByRole("button", { name: "Switch profile" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Linked to alex@example.com")).toBeInTheDocument();
    expect(within(dialog).queryByText("Default profile")).not.toBeInTheDocument();
    expect(setActiveProfileMock).not.toHaveBeenCalled();
  });

  it("hides itself and logs a warning when the profiles query fails", async () => {
    listProfilesMock.mockReset().mockRejectedValue(new Error("sqlite unavailable"));
    renderSwitcher();

    await waitFor(() => expect(warnMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Switch profile" })).not.toBeInTheDocument();
  });

  describe("with a custom trigger (sidebar-nav's account card)", () => {
    it("opens the picker from the given trigger instead of the built-in pill button", async () => {
      renderSwitcher({ children: <button type="button">Account trigger</button> });

      expect(screen.queryByRole("button", { name: "Switch profile" })).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole("button", { name: "Account trigger" }));

      expect(await screen.findByText("Alex")).toBeInTheDocument();
    });

    it("still renders the given trigger, inert, when the profiles query fails", async () => {
      listProfilesMock.mockReset().mockRejectedValue(new Error("sqlite unavailable"));
      renderSwitcher({ children: <button type="button">Account trigger</button> });

      await waitFor(() => expect(warnMock).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "Account trigger" })).toBeInTheDocument();
    });
  });
});
