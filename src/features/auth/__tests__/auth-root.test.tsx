import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { AuthRoot } from "../auth-root";

vi.mock("@/features/auth/auth-provider", () => ({
  AuthProvider: ({ children }: PropsWithChildren) => <div data-testid="auth-provider">{children}</div>,
}));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({ children }: PropsWithChildren) => <div data-testid="auth-gate">{children}</div>,
}));
vi.mock("@/features/auth/profile-gate", () => ({
  ProfileGate: ({ children }: PropsWithChildren) => <div data-testid="profile-gate">{children}</div>,
}));
vi.mock("@/features/onboarding", () => ({
  OnboardingGate: ({ children }: PropsWithChildren) => <div data-testid="onboarding-gate">{children}</div>,
}));

describe("AuthRoot", () => {
  it("nests AuthProvider > AuthGate > ProfileGate > OnboardingGate around its children", () => {
    render(
      <AuthRoot>
        <div data-testid="app-content" />
      </AuthRoot>
    );

    const provider = screen.getByTestId("auth-provider");
    const gate = screen.getByTestId("auth-gate");
    const profileGate = screen.getByTestId("profile-gate");
    const onboardingGate = screen.getByTestId("onboarding-gate");
    const content = screen.getByTestId("app-content");

    expect(provider).toContainElement(gate);
    expect(gate).toContainElement(profileGate);
    expect(profileGate).toContainElement(onboardingGate);
    expect(onboardingGate).toContainElement(content);
  });
});
