import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { logger } from "@/shared/lib/logger";
import { RemoteErrorState } from "../remote-error-state";

describe("RemoteErrorState", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("classifies TMDB 401 errors as authentication problems", () => {
    render(<RemoteErrorState error={new Error("TMDB 401: invalid token")} onRetry={() => {}} />);
    expect(screen.getByText(/token stored by the desktop app/i)).toBeInTheDocument();
  });

  it("classifies SQLite errors as local data problems", () => {
    render(<RemoteErrorState error={new Error("plugin:sql error")} onRetry={() => {}} />);
    expect(screen.getByText(/unable to open local data/i)).toBeInTheDocument();
  });

  it("falls back to a connection message and points to the local log instead of the raw error", () => {
    render(<RemoteErrorState error={new Error("socket hang up")} onRetry={() => {}} />);
    expect(screen.getByText(/connection to TMDB failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(/written to the local log/i)).toBeInTheDocument();
    expect(screen.queryByText("socket hang up")).not.toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<RemoteErrorState error={new Error("boom")} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the technical details section and skips logging when there is no message to extract", () => {
    const logError = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    render(<RemoteErrorState error={undefined} onRetry={() => {}} />);

    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    expect(logError).not.toHaveBeenCalled();

    logError.mockRestore();
  });
});
