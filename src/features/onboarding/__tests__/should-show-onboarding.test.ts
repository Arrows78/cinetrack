import { describe, expect, it } from "vitest";
import { shouldShowOnboarding } from "../should-show-onboarding";

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
