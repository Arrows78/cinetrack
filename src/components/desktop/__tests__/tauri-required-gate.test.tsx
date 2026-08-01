import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { TauriRequiredGate } from "../tauri-required-gate";

const isTauriApp = vi.fn(() => false);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriApp() }));

describe("TauriRequiredGate", () => {
  it("blocks rendering and shows the dedicated screen outside Tauri", () => {
    isTauriApp.mockReturnValue(false);

    render(
      <TauriRequiredGate>
        <div data-testid="app-content" />
      </TauriRequiredGate>
    );

    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /desktop app required/i })).toBeInTheDocument();
    expect(screen.getAllByText(/pnpm tauri dev/).length).toBeGreaterThan(0);
  });

  it("renders children when running inside the Tauri webview", () => {
    isTauriApp.mockReturnValue(true);

    render(
      <TauriRequiredGate>
        <div data-testid="app-content" />
      </TauriRequiredGate>
    );

    expect(screen.getByTestId("app-content")).toBeInTheDocument();
  });
});
