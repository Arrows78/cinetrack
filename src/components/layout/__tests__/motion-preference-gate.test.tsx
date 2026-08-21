import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { MotionPreferenceGate } from "../motion-preference-gate";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

let preferences: { reduceMotion?: boolean } | undefined = { reduceMotion: false };
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: preferences }),
}));

vi.mock("framer-motion", () => ({
  MotionConfig: ({ reducedMotion, children }: PropsWithChildren<{ reducedMotion: string }>) => (
    <div data-testid="motion-config" data-reduced-motion={reducedMotion}>
      {children}
    </div>
  ),
}));

describe("MotionPreferenceGate", () => {
  it('passes reducedMotion="always" to MotionConfig when the preference is on', () => {
    preferences = { reduceMotion: true };
    render(
      <MotionPreferenceGate>
        <span>child content</span>
      </MotionPreferenceGate>
    );

    expect(screen.getByTestId("motion-config")).toHaveAttribute("data-reduced-motion", "always");
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it('passes reducedMotion="user" (not "never") when the preference is off, so the OS setting is still respected', () => {
    preferences = { reduceMotion: false };
    render(
      <MotionPreferenceGate>
        <span>child content</span>
      </MotionPreferenceGate>
    );

    expect(screen.getByTestId("motion-config")).toHaveAttribute("data-reduced-motion", "user");
  });

  it('passes reducedMotion="user" when preferences data is undefined', () => {
    preferences = undefined;
    render(
      <MotionPreferenceGate>
        <span>child content</span>
      </MotionPreferenceGate>
    );

    expect(screen.getByTestId("motion-config")).toHaveAttribute("data-reduced-motion", "user");
  });
});
