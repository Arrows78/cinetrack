import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import i18n from "@/i18n";

const updateTrayLanguage = vi.fn();
vi.mock("@/features/desktop/desktop-service", () => ({
  desktopService: { updateTrayLanguage: (...args: unknown[]) => updateTrayLanguage(...args) },
}));

const loggerWarn = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { info: vi.fn(), warn: (...args: unknown[]) => loggerWarn(...args), error: vi.fn() },
}));

import { useTrayLanguage } from "../use-tray-language";

beforeEach(async () => {
  updateTrayLanguage.mockReset().mockResolvedValue(undefined);
  loggerWarn.mockReset();
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("useTrayLanguage", () => {
  it("tells the tray the interface language at start", async () => {
    renderHook(() => useTrayLanguage());

    await waitFor(() => expect(updateTrayLanguage).toHaveBeenCalledWith("en"));
  });

  it("follows the interface language when it changes", async () => {
    renderHook(() => useTrayLanguage());
    await waitFor(() => expect(updateTrayLanguage).toHaveBeenCalledWith("en"));

    await act(async () => {
      await i18n.changeLanguage("fr");
    });

    await waitFor(() => expect(updateTrayLanguage).toHaveBeenLastCalledWith("fr"));
  });

  it("logs a refusal instead of leaving it unhandled", async () => {
    updateTrayLanguage.mockRejectedValue(new Error("no tray"));
    renderHook(() => useTrayLanguage());

    await waitFor(() => expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining("no tray")));
  });
});
