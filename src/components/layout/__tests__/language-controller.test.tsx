import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { LanguageController } from "../language-controller";

let language: string | undefined;
const updatePreference = vi.fn();
vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({
    data: language ? { language } : undefined,
    updatePreference: (...args: unknown[]) => updatePreference(...args),
  }),
}));

beforeEach(async () => {
  updatePreference.mockReset().mockResolvedValue(undefined);
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("LanguageController", () => {
  it("does nothing until the preference has loaded", () => {
    language = undefined;
    render(<LanguageController />);

    expect(i18n.language).toBe("en");
    expect(updatePreference).not.toHaveBeenCalled();
  });

  it("switches the interface to a language chosen elsewhere (restore, another device's sync)", async () => {
    language = "fr";
    render(<LanguageController />);

    await waitFor(() => expect(i18n.language).toBe("fr"));
    expect(updatePreference).not.toHaveBeenCalled();
  });

  it("follows a preference that changes while the app is open", async () => {
    language = "en";
    const { rerender } = render(<LanguageController />);
    expect(i18n.language).toBe("en");

    language = "fr";
    rerender(<LanguageController />);
    await waitFor(() => expect(i18n.language).toBe("fr"));

    language = "en";
    rerender(<LanguageController />);
    await waitFor(() => expect(i18n.language).toBe("en"));
  });

  // The stored default is "en" whether or not anyone chose it, and the
  // interface language is detected from the system: a French system that
  // never opened Settings must not flip to English, nor keep fetching
  // English catalogue data under a French interface.
  it("records the detected interface language when the preference is still the untouched default", async () => {
    await i18n.changeLanguage("fr");
    language = "en";
    render(<LanguageController />);

    await waitFor(() => expect(updatePreference).toHaveBeenCalledWith({ key: "language", value: "fr" }));
    expect(i18n.language).toBe("fr");
  });

  it("logs a failed save instead of throwing", async () => {
    await i18n.changeLanguage("fr");
    language = "en";
    updatePreference.mockRejectedValue(new Error("disk full"));

    expect(() => render(<LanguageController />)).not.toThrow();
    await waitFor(() => expect(updatePreference).toHaveBeenCalledTimes(1));
  });
});
