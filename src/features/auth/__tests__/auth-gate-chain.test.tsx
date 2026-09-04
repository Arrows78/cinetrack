import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";

import { AuthGate } from "@/features/auth/auth-gate";
import { ProfileGate } from "@/features/auth/profile-gate";
import type { CreateProfileScreen as CreateProfileScreenComponent } from "@/features/auth/create-profile-screen";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const {
  useAuthMock,
  authConfigMock,
  useProfileForSupabaseUserMock,
  usePreferencesMock,
  setActiveProfileMock,
  useCreateProfileForSupabaseUserMock,
  cloudProfileRepositoryMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  authConfigMock: { required: false } as { required: boolean },
  useProfileForSupabaseUserMock: vi.fn(),
  usePreferencesMock: vi.fn(),
  setActiveProfileMock: vi.fn(),
  useCreateProfileForSupabaseUserMock: vi.fn(),
  cloudProfileRepositoryMock: { get: vi.fn(), save: vi.fn() },
}));

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/features/auth/auth-screen", () => ({
  AuthScreen: () => <div data-testid="mock-auth-screen" />,
}));

vi.mock("@/features/auth/create-profile-screen", () => ({
  CreateProfileScreen: ({ supabaseUserId }: { supabaseUserId: string }) => (
    <div data-testid="mock-create-profile-screen">{supabaseUserId}</div>
  ),
}));

vi.mock("@/features/auth/auth-client", () => ({
  authConfig: authConfigMock,
}));

vi.mock("@/features/profiles/use-profiles", () => ({
  useProfileForSupabaseUser: (supabaseUserId: string | undefined) => useProfileForSupabaseUserMock(supabaseUserId),
  useCreateProfileForSupabaseUser: () => useCreateProfileForSupabaseUserMock(),
}));

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => usePreferencesMock(),
}));

vi.mock("@/features/preferences/preferences-repository", () => ({
  preferencesRepository: {
    setActiveProfile: (...args: unknown[]) => setActiveProfileMock(...args),
  },
}));

vi.mock("@/features/auth/cloud-profile-repository", () => ({
  cloudProfileRepository: cloudProfileRepositoryMock,
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.clearAllMocks();
  authConfigMock.required = false;
  setActiveProfileMock.mockResolvedValue(undefined);
  useCreateProfileForSupabaseUserMock.mockReturnValue({
    create: vi.fn().mockResolvedValue(undefined),
    isSaving: false,
    error: null,
  });
  cloudProfileRepositoryMock.get.mockResolvedValue(null);
  cloudProfileRepositoryMock.save.mockResolvedValue(undefined);
});

function renderWithQueryClient(children: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children: inner }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>;
  }
  return { ...render(children, { wrapper: Wrapper }), queryClient };
}

// ---------------------------------------------------------------------------
// AuthGate
// ---------------------------------------------------------------------------

describe("AuthGate", () => {
  it("renders children regardless of anything else when required is false", () => {
    useAuthMock.mockReturnValue({
      configured: false,
      required: false,
      session: null,
      status: "loading",
    });

    render(
      <AuthGate>
        <div data-testid="child">child content</div>
      </AuthGate>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-auth-screen")).not.toBeInTheDocument();
  });

  it("shows the loading screen while status is loading", () => {
    useAuthMock.mockReturnValue({
      configured: true,
      required: true,
      session: null,
      status: "loading",
    });

    render(
      <AuthGate>
        <div data-testid="child">child content</div>
      </AuthGate>
    );

    expect(screen.getByText(i18n.t("auth.gate.restoringSession"))).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("shows the needs-configuration panel when auth is required but not configured", () => {
    useAuthMock.mockReturnValue({
      configured: false,
      required: true,
      session: null,
      status: "ready",
    });

    render(
      <AuthGate>
        <div data-testid="child">child content</div>
      </AuthGate>
    );

    expect(screen.getByText(i18n.t("auth.gate.needsConfiguration"))).toBeInTheDocument();
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("renders AuthScreen when required and configured but there is no session", () => {
    useAuthMock.mockReturnValue({
      configured: true,
      required: true,
      session: null,
      status: "ready",
    });

    render(
      <AuthGate>
        <div data-testid="child">child content</div>
      </AuthGate>
    );

    expect(screen.getByTestId("mock-auth-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("renders children when required, configured, and a session exists", () => {
    useAuthMock.mockReturnValue({
      configured: true,
      required: true,
      session: { user: { id: "u1" } },
      status: "ready",
    });

    render(
      <AuthGate>
        <div data-testid="child">child content</div>
      </AuthGate>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-auth-screen")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProfileGate
// ---------------------------------------------------------------------------

describe("ProfileGate", () => {
  const supabaseUserId = "supa-user-1";
  const resolvedProfileId = "profile-1";

  function loadedProfileQuery(data: unknown) {
    return { data, isLoading: false, isSuccess: true, isError: false, error: null, refetch: vi.fn() };
  }

  function loadedPreferencesQuery(activeProfileId: string) {
    return {
      data: { activeProfileId },
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  }

  it("renders children immediately without querying when auth is not required", () => {
    authConfigMock.required = false;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });

    render(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(useProfileForSupabaseUserMock).not.toHaveBeenCalled();
    expect(usePreferencesMock).not.toHaveBeenCalled();
  });

  it("renders children when auth is required but there is no session yet", () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: null });

    render(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(useProfileForSupabaseUserMock).not.toHaveBeenCalled();
    expect(usePreferencesMock).not.toHaveBeenCalled();
  });

  it("shows the loading screen while the profile query is loading", () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });
    useProfileForSupabaseUserMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePreferencesMock.mockReturnValue(loadedPreferencesQuery("default"));

    renderWithQueryClient(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(screen.getByText(i18n.t("profileGate.resolving"))).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("shows the loading screen while the preferences query is loading", () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });
    useProfileForSupabaseUserMock.mockReturnValue(loadedProfileQuery({ id: resolvedProfileId }));
    usePreferencesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(screen.getByText(i18n.t("profileGate.resolving"))).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("shows a remote error state with working retry when the profile query fails", async () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });
    const refetch = vi.fn();
    useProfileForSupabaseUserMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error("profile lookup failed"),
      refetch,
    });
    usePreferencesMock.mockReturnValue(loadedPreferencesQuery("default"));

    renderWithQueryClient(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(screen.getByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("errors.retry") }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a remote error state with working retry when the preferences query fails", async () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });
    useProfileForSupabaseUserMock.mockReturnValue(loadedProfileQuery({ id: resolvedProfileId }));
    const refetch = vi.fn();
    usePreferencesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error("preferences read failed"),
      refetch,
    });

    renderWithQueryClient(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(await screen.findByText(i18n.t("errors.catalogUnavailable"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("errors.retry") }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders CreateProfileScreen when there is no resolved profile", async () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });
    useProfileForSupabaseUserMock.mockReturnValue(loadedProfileQuery(undefined));
    usePreferencesMock.mockReturnValue(loadedPreferencesQuery("default"));

    renderWithQueryClient(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(await screen.findByTestId("mock-create-profile-screen")).toHaveTextContent(supabaseUserId);
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("triggers setActiveProfile and shows the loading screen while the resolved profile differs from the active one", async () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });
    useProfileForSupabaseUserMock.mockReturnValue(loadedProfileQuery({ id: resolvedProfileId }));
    usePreferencesMock.mockReturnValue(loadedPreferencesQuery("default"));

    renderWithQueryClient(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(screen.getByText(i18n.t("profileGate.resolving"))).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();

    await waitFor(() => expect(setActiveProfileMock).toHaveBeenCalledWith(resolvedProfileId, supabaseUserId));
  });

  it("renders children once the active profile matches the resolved profile", async () => {
    authConfigMock.required = true;
    useAuthMock.mockReturnValue({ session: { user: { id: supabaseUserId } } });
    useProfileForSupabaseUserMock.mockReturnValue(loadedProfileQuery({ id: resolvedProfileId }));
    usePreferencesMock.mockReturnValue(loadedPreferencesQuery(resolvedProfileId));

    renderWithQueryClient(
      <ProfileGate>
        <div data-testid="child">child</div>
      </ProfileGate>
    );

    expect(await screen.findByTestId("child")).toBeInTheDocument();
    expect(setActiveProfileMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CreateProfileScreen
// ---------------------------------------------------------------------------

describe("CreateProfileScreen", () => {
  const supabaseUserId = "supa-user-1";
  const signOutMock = vi.fn();
  const createMock = vi.fn();

  // This suite tests the real component, but the module is shallow-mocked
  // above (for ProfileGate's tests, per the plan). vi.importActual bypasses
  // that mock to get the genuine implementation for this describe block.
  let CreateProfileScreen: typeof CreateProfileScreenComponent;

  beforeAll(async () => {
    const actual = await vi.importActual<{ CreateProfileScreen: typeof CreateProfileScreenComponent }>(
      "@/features/auth/create-profile-screen"
    );
    CreateProfileScreen = actual.CreateProfileScreen;
  });

  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: { email: "a@b.com" }, signOut: signOutMock });
    useCreateProfileForSupabaseUserMock.mockReturnValue({
      create: createMock,
      isSaving: false,
      error: null,
    });
  });

  function getNameInput() {
    return screen.getByLabelText(i18n.t("profileGate.nameLabel"));
  }

  function getSubmitButton() {
    return screen.getByRole("button", { name: i18n.t("profileGate.createSubmit") });
  }

  it("does not call create when the name is blank or whitespace only", () => {
    render(<CreateProfileScreen supabaseUserId={supabaseUserId} />);

    fireEvent.change(getNameInput(), { target: { value: "   " } });
    fireEvent.submit(getNameInput().closest("form")!);

    expect(createMock).not.toHaveBeenCalled();
  });

  it("calls create with the trimmed name and supabaseUserId for a real name", () => {
    render(<CreateProfileScreen supabaseUserId={supabaseUserId} />);

    fireEvent.change(getNameInput(), { target: { value: "Alice" } });
    fireEvent.submit(getNameInput().closest("form")!);

    expect(createMock).toHaveBeenCalledWith({ name: "Alice", supabaseUserId });
  });

  it("disables the submit button while isSaving is true", () => {
    useCreateProfileForSupabaseUserMock.mockReturnValue({
      create: createMock,
      isSaving: true,
      error: null,
    });

    render(<CreateProfileScreen supabaseUserId={supabaseUserId} />);

    expect(getSubmitButton()).toBeDisabled();
  });

  it("shows the translated error message when error is truthy", () => {
    useCreateProfileForSupabaseUserMock.mockReturnValue({
      create: createMock,
      isSaving: false,
      error: new Error("boom"),
    });

    render(<CreateProfileScreen supabaseUserId={supabaseUserId} />);

    expect(screen.getByRole("alert")).toHaveTextContent(i18n.t("profileGate.createError"));
  });

  it("calls signOut when the sign-out button is clicked", () => {
    render(<CreateProfileScreen supabaseUserId={supabaseUserId} />);

    fireEvent.click(screen.getByText(i18n.t("profileGate.signOut")));

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
