import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { OnboardingGate, shouldShowOnboarding } from "../onboarding-gate";

const preferencesMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => preferencesMock(),
}));

const libraryMediaKeysMock = vi.fn();
vi.mock("@/features/library/use-library", () => ({
  useLibraryMediaKeys: () => libraryMediaKeysMock(),
}));

vi.mock("@/features/onboarding/onboarding-screen", () => ({
  OnboardingScreen: () => <div data-testid="onboarding-screen" />,
}));

describe("shouldShowOnboarding", () => {
  it("skips once onboarding is already completed, regardless of library state", () => {
    expect(shouldShowOnboarding({ onboardingCompleted: true, hasExistingLibrary: false })).toBe(false);
    expect(shouldShowOnboarding({ onboardingCompleted: true, hasExistingLibrary: true })).toBe(false);
  });

  it("shows onboarding when not completed and the library is empty", () => {
    expect(shouldShowOnboarding({ onboardingCompleted: false, hasExistingLibrary: false })).toBe(true);
  });

  it("skips when not completed but the library already has items (an existing install)", () => {
    expect(shouldShowOnboarding({ onboardingCompleted: false, hasExistingLibrary: true })).toBe(false);
  });
});

describe("OnboardingGate", () => {
  const updatePreferenceMock = vi.fn();
  const refetchPreferencesMock = vi.fn();
  const refetchLibraryKeysMock = vi.fn();

  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    updatePreferenceMock.mockReset().mockResolvedValue(undefined);
    refetchPreferencesMock.mockReset();
    refetchLibraryKeysMock.mockReset();
    preferencesMock.mockReset().mockReturnValue({
      data: { onboardingCompleted: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchPreferencesMock,
      updatePreference: updatePreferenceMock,
    });
    libraryMediaKeysMock.mockReset().mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchLibraryKeysMock,
    });
  });

  it("shows a loading screen while preferences are loading", () => {
    preferencesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchPreferencesMock,
      updatePreference: updatePreferenceMock,
    });
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(screen.getByText(i18n.t("onboarding.loading"))).toBeInTheDocument();
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
  });

  it("shows a loading screen while the library-keys check is loading", () => {
    libraryMediaKeysMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchLibraryKeysMock,
    });
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(screen.getByText(i18n.t("onboarding.loading"))).toBeInTheDocument();
  });

  it("renders children instead of blocking the whole app when preferences fail to load", () => {
    preferencesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: refetchPreferencesMock,
      updatePreference: updatePreferenceMock,
    });
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-screen")).not.toBeInTheDocument();
  });

  it("renders children instead of blocking the whole app when the library-keys check fails", () => {
    libraryMediaKeysMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: refetchLibraryKeysMock,
    });
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-screen")).not.toBeInTheDocument();
  });

  it("renders children once onboarding is already completed", () => {
    preferencesMock.mockReturnValue({
      data: { onboardingCompleted: true },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchPreferencesMock,
      updatePreference: updatePreferenceMock,
    });
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-screen")).not.toBeInTheDocument();
  });

  it("renders the onboarding screen when not completed and the library is empty", () => {
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
  });

  it("renders children and silently marks onboarding complete for an existing install with a non-empty library", () => {
    libraryMediaKeysMock.mockReturnValue({
      data: [{ mediaId: 1, mediaType: "movie" }],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchLibraryKeysMock,
    });
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-screen")).not.toBeInTheDocument();
    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "onboardingCompleted", value: true });
  });

  it("does not fire the silent mark-complete write once onboarding is already completed", () => {
    preferencesMock.mockReturnValue({
      data: { onboardingCompleted: true },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchPreferencesMock,
      updatePreference: updatePreferenceMock,
    });
    libraryMediaKeysMock.mockReturnValue({
      data: [{ mediaId: 1, mediaType: "movie" }],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchLibraryKeysMock,
    });
    render(
      <OnboardingGate>
        <div data-testid="app" />
      </OnboardingGate>
    );
    expect(updatePreferenceMock).not.toHaveBeenCalled();
  });
});
