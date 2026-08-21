import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { BootRecoveryGate } from "../boot-recovery-gate";

const isTauriAppMock = vi.fn(() => true);
vi.mock("@/shared/lib/platform", () => ({ isTauriApp: () => isTauriAppMock() }));

let bootRecovery: {
  recovered: boolean;
  blocked: boolean;
  quarantinedPath: string | null;
  originalError: string | null;
};
const invokeMock = vi.fn(async (command: string) => {
  if (command === "get_boot_recovery") return bootRecovery;
  throw new Error(`Unhandled command: ${command}`);
});
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string) => invokeMock(command),
}));

const restoreAutomaticBackup = vi.fn();
vi.mock("@/features/backup/maintenance-service", () => ({
  maintenanceService: { restoreAutomaticBackup: () => restoreAutomaticBackup() },
}));

const reloadMock = vi.fn();
Object.defineProperty(window, "location", {
  value: { ...window.location, reload: reloadMock },
  writable: true,
});

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <BootRecoveryGate>
      <p>app content</p>
    </BootRecoveryGate>,
    { wrapper: Wrapper }
  );
}

describe("BootRecoveryGate", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    isTauriAppMock.mockReturnValue(true);
    bootRecovery = { recovered: false, blocked: false, quarantinedPath: null, originalError: null };
    invokeMock.mockClear();
    restoreAutomaticBackup.mockReset();
    reloadMock.mockReset();
  });

  it("renders children immediately outside the Tauri runtime", () => {
    isTauriAppMock.mockReturnValue(false);
    renderGate();

    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("renders children once loaded when no recovery happened", async () => {
    renderGate();

    await waitFor(() => expect(screen.getByText("app content")).toBeInTheDocument());
  });

  it("shows the recovery screen instead of children when the database had to be reset", async () => {
    bootRecovery = {
      recovered: true,
      blocked: false,
      quarantinedPath: "/data/app.db.corrupt-123",
      originalError: "boom",
    };
    renderGate();

    await waitFor(() => expect(screen.getByText(/reset your local database/i)).toBeInTheDocument());
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it('"Continue with a fresh start" dismisses the screen and renders children', async () => {
    bootRecovery = {
      recovered: true,
      blocked: false,
      quarantinedPath: "/data/app.db.corrupt-123",
      originalError: "boom",
    };
    renderGate();
    await waitFor(() => expect(screen.getByText(/reset your local database/i)).toBeInTheDocument());

    screen.getByRole("button", { name: /continue with a fresh start/i }).click();

    await waitFor(() => expect(screen.getByText("app content")).toBeInTheDocument());
  });

  it("restoring the automatic backup reloads the app on success", async () => {
    bootRecovery = {
      recovered: true,
      blocked: false,
      quarantinedPath: "/data/app.db.corrupt-123",
      originalError: "boom",
    };
    restoreAutomaticBackup.mockResolvedValueOnce(undefined);
    renderGate();
    await waitFor(() => expect(screen.getByText(/reset your local database/i)).toBeInTheDocument());

    screen.getByRole("button", { name: /restore last automatic backup/i }).click();

    await waitFor(() => expect(restoreAutomaticBackup).toHaveBeenCalled());
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it("shows a translated error and stays on the recovery screen when restoring fails", async () => {
    bootRecovery = {
      recovered: true,
      blocked: false,
      quarantinedPath: "/data/app.db.corrupt-123",
      originalError: "boom",
    };
    // The rejection carries a raw, untranslated message — the gate must
    // never surface it directly (this is the first screen an already
    // distressed user sees), only the translated fallback.
    restoreAutomaticBackup.mockRejectedValueOnce(new Error("No automatic backup was found."));
    renderGate();
    await waitFor(() => expect(screen.getByText(/reset your local database/i)).toBeInTheDocument());

    screen.getByRole("button", { name: /restore last automatic backup/i }).click();

    await waitFor(() => expect(screen.getByText("Couldn't restore the automatic backup.")).toBeInTheDocument());
    expect(screen.queryByText("No automatic backup was found.")).not.toBeInTheDocument();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("shows the blocked screen with no continue option when a migration failed", async () => {
    bootRecovery = { recovered: false, blocked: true, quarantinedPath: null, originalError: "Migration 12 failed" };
    renderGate();

    await waitFor(() => expect(screen.getByText(/can't safely open right now/i)).toBeInTheDocument());
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue with a fresh start/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore last automatic backup/i })).toBeInTheDocument();
  });

  it("restoring from the blocked screen reloads the app on success", async () => {
    bootRecovery = { recovered: false, blocked: true, quarantinedPath: null, originalError: "Migration 12 failed" };
    restoreAutomaticBackup.mockResolvedValueOnce(undefined);
    renderGate();
    await waitFor(() => expect(screen.getByText(/can't safely open right now/i)).toBeInTheDocument());

    screen.getByRole("button", { name: /restore last automatic backup/i }).click();

    await waitFor(() => expect(restoreAutomaticBackup).toHaveBeenCalled());
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });
});
