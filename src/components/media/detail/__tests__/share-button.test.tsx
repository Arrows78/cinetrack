import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { MediaSummary } from "@/types/media";
import { ShareButton } from "../share-button";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const loggerWarnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args) },
}));

function buildMedia(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    id: 42,
    mediaType: "series",
    title: "Severance",
    overview: "",
    genres: [],
    cast: [],
    ...overrides,
  };
}

describe("ShareButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    toastMock.mockReset();
    loggerWarnMock.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "share");
  });

  it("copies the title's TMDB link and toasts success when the Web Share API is unavailable", async () => {
    render(<ShareButton media={buildMedia({ mediaType: "series", id: 42 })} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://www.themoviedb.org/tv/42");
    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ description: "Link copied to clipboard", variant: "success" })
    );
  });

  it("builds a /movie/ TMDB url for a movie", async () => {
    render(<ShareButton media={buildMedia({ mediaType: "movie", id: 7 })} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://www.themoviedb.org/movie/7");
  });

  it("toasts an error and logs a warning when the clipboard write rejects", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      writable: true,
      configurable: true,
    });
    render(<ShareButton media={buildMedia()} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ description: "Couldn't share this title", variant: "error" })
    );
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it("uses the Web Share API instead of the clipboard when the webview supports it", () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareMock, writable: true, configurable: true });
    render(<ShareButton media={buildMedia({ title: "Severance", mediaType: "series", id: 42 })} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(shareMock).toHaveBeenCalledWith({ title: "Severance", url: "https://www.themoviedb.org/tv/42" });
  });

  it("does not toast an error when the user just dismisses the native share sheet", async () => {
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const shareMock = vi.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, "share", { value: shareMock, writable: true, configurable: true });
    render(<ShareButton media={buildMedia()} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await vi.waitFor(() => expect(shareMock).toHaveBeenCalled());
    expect(toastMock).not.toHaveBeenCalled();
  });
});
