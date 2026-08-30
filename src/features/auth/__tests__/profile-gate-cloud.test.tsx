import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useProfile: vi.fn(),
  usePreferences: vi.fn(),
  setActiveProfile: vi.fn(),
  createLocalProfile: vi.fn(),
  cloudGet: vi.fn(),
  cloudSave: vi.fn(),
}));

vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/features/auth/auth-client", () => ({ authConfig: { required: true } }));
vi.mock("@/features/auth/create-profile-screen", () => ({
  CreateProfileScreen: ({ supabaseUserId }: { supabaseUserId: string }) => (
    <div data-testid="create-profile">{supabaseUserId}</div>
  ),
}));
vi.mock("@/features/auth/cloud-profile-repository", () => ({
  cloudProfileRepository: {
    get: () => mocks.cloudGet(),
    save: (...args: unknown[]) => mocks.cloudSave(...args),
  },
}));
vi.mock("@/features/profiles/use-profiles", () => ({
  useProfileForSupabaseUser: () => mocks.useProfile(),
  useCreateProfileForSupabaseUser: () => ({
    create: (...args: unknown[]) => mocks.createLocalProfile(...args),
    isSaving: false,
    error: null,
  }),
}));
vi.mock("@/features/preferences/use-preferences", () => ({ usePreferences: () => mocks.usePreferences() }));
vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: { setActiveProfile: (...args: unknown[]) => mocks.setActiveProfile(...args) },
}));

import { ProfileGate } from "@/features/auth/profile-gate";

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function profileQuery(data: unknown) {
  return { data, isLoading: false, isError: false, isSuccess: true, error: null, refetch: vi.fn() };
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ session: { user: { id: "user-1" } } });
  mocks.usePreferences.mockReturnValue({
    data: { activeProfileId: "profile-1" },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  mocks.setActiveProfile.mockResolvedValue(undefined);
  mocks.createLocalProfile.mockResolvedValue({ id: "profile-1", name: "Alice", avatar: null });
  mocks.cloudSave.mockResolvedValue(undefined);
});

describe("ProfileGate cloud continuity", () => {
  it("recreates the local profile from the private account profile on a new device", async () => {
    mocks.useProfile.mockReturnValue(profileQuery(null));
    mocks.cloudGet.mockResolvedValue({ userId: "user-1", displayName: "Alice", avatarPath: "avatar.png" });

    render(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>,
      { wrapper: wrapper() }
    );

    await waitFor(() =>
      expect(mocks.createLocalProfile).toHaveBeenCalledWith({
        name: "Alice",
        avatar: "avatar.png",
        supabaseUserId: "user-1",
      })
    );
    expect(screen.getByText(i18n.t("profileGate.resolving"))).toBeInTheDocument();
  });

  it("seeds Supabase once when an existing local installation has no remote account profile", async () => {
    mocks.useProfile.mockReturnValue(profileQuery({ id: "profile-1", name: "Alice", avatar: "avatar.png" }));
    mocks.cloudGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "user-1", displayName: "Alice", avatarPath: "avatar.png" });

    render(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>,
      { wrapper: wrapper() }
    );

    await waitFor(() => expect(mocks.cloudSave).toHaveBeenCalledWith("Alice", "avatar.png"));
    await waitFor(() => expect(screen.getByTestId("child")).toBeInTheDocument());
  });

  it("surfaces cloud profile failures and allows retry", async () => {
    mocks.useProfile.mockReturnValue(profileQuery({ id: "profile-1", name: "Alice", avatar: null }));
    mocks.cloudGet.mockRejectedValue(new Error("cloud unavailable"));

    render(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>,
      { wrapper: wrapper() }
    );

    const retry = await screen.findByRole("button", { name: i18n.t("errors.retry") });
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.cloudGet).toHaveBeenCalledTimes(2));
  });
});
