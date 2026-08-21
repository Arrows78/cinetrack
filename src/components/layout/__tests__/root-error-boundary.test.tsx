import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { logger } from "@/features/diagnostics/logger";
import { RootErrorBoundary } from "../root-error-boundary";

function Bomb(): never {
  throw new Error("Kaboom");
}

function BombNonError(): never {
  // Exercises the non-Error branch of getDerivedStateFromError.
  throw "Kaboom string";
}

describe("RootErrorBoundary", () => {
  // React logs the caught error to the console in dev; keep the test output clean.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    consoleError.mockClear();
  });

  it("renders children when nothing throws", () => {
    render(
      <RootErrorBoundary>
        <p>All good</p>
      </RootErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows a recoverable fallback instead of a white screen when a child throws", () => {
    render(
      <RootErrorBoundary>
        <Bomb />
      </RootErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText(/written to the local log/i)).toBeInTheDocument();
    expect(screen.queryByText("Kaboom")).not.toBeInTheDocument();
  });

  it("reloads the page from the fallback's action", () => {
    render(
      <RootErrorBoundary>
        <Bomb />
      </RootErrorBoundary>
    );

    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still shows the recoverable fallback when a child throws a non-Error value", () => {
    const logError = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    render(
      <RootErrorBoundary>
        <BombNonError />
      </RootErrorBoundary>
    );

    // getDerivedStateFromError wraps non-Error throws (e.g. a bare string) into
    // an Error via `new Error(String(error))` — this exercises that branch and
    // confirms it still renders the same fallback instead of white-screening.
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(logError).toHaveBeenCalledTimes(1);

    logError.mockRestore();
  });
});
