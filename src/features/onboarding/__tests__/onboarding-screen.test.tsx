import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { OnboardingScreen } from "../onboarding-screen";

const navigateMock = vi.fn();
vi.mock("@/app/router-config", () => ({
  router: { navigate: (...args: unknown[]) => navigateMock(...args) },
}));

const updatePreferenceMock = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ updatePreference: updatePreferenceMock }),
}));

describe("OnboardingScreen", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    navigateMock.mockReset();
    updatePreferenceMock.mockReset().mockResolvedValue(undefined);
  });

  it("renders the welcome copy and all three choices", () => {
    render(<OnboardingScreen />);

    expect(screen.getByText(i18n.t("onboarding.title"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("onboarding.subtitle"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(i18n.t("onboarding.importTitle")) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(i18n.t("onboarding.newLibraryTitle")) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(i18n.t("onboarding.pickTonightTitle")) })).toBeInTheDocument();
  });

  it("navigates to /settings and marks onboarding complete when 'importing my history' is chosen", async () => {
    render(<OnboardingScreen />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("onboarding.importTitle")) }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/settings" });
    await waitFor(() => expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "onboardingCompleted", value: true }));
  });

  it("navigates to /search when 'starting a new library' is chosen", () => {
    render(<OnboardingScreen />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("onboarding.newLibraryTitle")) }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/search" });
  });

  it("navigates to /watch-tonight when 'pick something tonight' is chosen", () => {
    render(<OnboardingScreen />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("onboarding.pickTonightTitle")) }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/watch-tonight" });
  });

  it("shows an inline error and does not stay disabled forever when saving the choice fails", async () => {
    updatePreferenceMock.mockRejectedValueOnce(new Error("boom"));
    render(<OnboardingScreen />);

    const button = screen.getByRole("button", { name: new RegExp(i18n.t("onboarding.pickTonightTitle")) });
    fireEvent.click(button);

    expect(await screen.findByText(i18n.t("onboarding.error"))).toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
