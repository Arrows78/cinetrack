import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import type * as FormatModule from "@/shared/utils/format";
import { DesktopSettings } from "../desktop-settings";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();
const readRecentMock = vi.fn();
const clearMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
    readRecent: (...args: unknown[]) => readRecentMock(...args),
    clear: (...args: unknown[]) => clearMock(...args),
  },
}));

const getLastBackupStatusMock = vi.fn();
const createAutomaticBackupMock = vi.fn();
const checkDataIntegrityMock = vi.fn();
const getAutomaticBackupInfoMock = vi.fn();
const restoreAutomaticBackupMock = vi.fn();
vi.mock("@/features/backup/maintenance-service", () => ({
  maintenanceService: {
    getLastBackupStatus: (...args: unknown[]) => getLastBackupStatusMock(...args),
    createAutomaticBackup: (...args: unknown[]) => createAutomaticBackupMock(...args),
    checkDataIntegrity: (...args: unknown[]) => checkDataIntegrityMock(...args),
    getAutomaticBackupInfo: (...args: unknown[]) => getAutomaticBackupInfoMock(...args),
    restoreAutomaticBackup: (...args: unknown[]) => restoreAutomaticBackupMock(...args),
  },
}));

const saveMock = vi.fn();
const unlockMock = vi.fn();
const lockMock = vi.fn();
vi.mock("@/features/desktop/token-vault", () => ({
  tokenVault: {
    save: (...args: unknown[]) => saveMock(...args),
    unlock: (...args: unknown[]) => unlockMock(...args),
    lock: (...args: unknown[]) => lockMock(...args),
  },
}));

const checkAndInstallMock = vi.fn();
vi.mock("@/features/desktop/update-service", () => ({
  updateService: { checkAndInstall: (...args: unknown[]) => checkAndInstallMock(...args) },
}));

const exportSummaryMock = vi.fn();
vi.mock("@/features/desktop/diagnostics-service", () => ({
  diagnosticsService: { exportSummary: (...args: unknown[]) => exportSummaryMock(...args) },
}));

const disableMock = vi.fn();
const enableMock = vi.fn();
const isEnabledMock = vi.fn();
vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: (...args: unknown[]) => disableMock(...args),
  enable: (...args: unknown[]) => enableMock(...args),
  isEnabled: (...args: unknown[]) => isEnabledMock(...args),
}));

const isTauriAppMock = vi.fn(() => true);
const isDesktopAppMock = vi.fn(() => true);
vi.mock("@/shared/lib/platform", () => ({
  isTauriApp: () => isTauriAppMock(),
  isDesktopApp: () => isDesktopAppMock(),
}));

const formatRelativeDateMock = vi.fn<(iso: string) => string>(() => "3 days ago");
vi.mock("@/shared/utils/format", async (importOriginal) => {
  const actual = await importOriginal<typeof FormatModule>();
  return { ...actual, formatRelativeDate: (iso: string) => formatRelativeDateMock(iso) };
});

describe("DesktopSettings", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    toastMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    readRecentMock.mockReset().mockResolvedValue(null);
    clearMock.mockReset().mockResolvedValue(undefined);

    getLastBackupStatusMock.mockReset().mockResolvedValue(null);
    createAutomaticBackupMock.mockReset().mockResolvedValue(undefined);
    checkDataIntegrityMock.mockReset();
    getAutomaticBackupInfoMock.mockReset();
    restoreAutomaticBackupMock.mockReset().mockResolvedValue(undefined);

    saveMock.mockReset().mockResolvedValue(undefined);
    unlockMock.mockReset();
    lockMock.mockReset();

    checkAndInstallMock.mockReset();
    exportSummaryMock.mockReset().mockResolvedValue({ commands: [], totalLinesParsed: 0 });

    disableMock.mockReset().mockResolvedValue(undefined);
    enableMock.mockReset().mockResolvedValue(undefined);
    isEnabledMock.mockReset().mockResolvedValue(false);

    isTauriAppMock.mockReset().mockReturnValue(true);
    isDesktopAppMock.mockReset().mockReturnValue(true);
    formatRelativeDateMock.mockReset().mockReturnValue("3 days ago");

    // jsdom doesn't implement the Clipboard API.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    // jsdom throws "not implemented: navigation" on a real reload.
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
  });

  describe("outside Tauri", () => {
    it("renders only the TMDB vault card and skips every backend call on mount", async () => {
      isTauriAppMock.mockReturnValue(false);
      isDesktopAppMock.mockReturnValue(false);
      render(<DesktopSettings />);

      expect(screen.getByText("TMDB Vault")).toBeInTheDocument();
      expect(screen.queryByText("System integration")).not.toBeInTheDocument();
      expect(screen.queryByText("Automatic backup")).not.toBeInTheDocument();
      expect(screen.queryByText("Diagnostics (local log)")).not.toBeInTheDocument();
      expect(screen.queryByText("Restore the automatic backup?")).not.toBeInTheDocument();

      // Let any microtasks flush, then confirm nothing backend-related fired.
      await Promise.resolve();
      expect(isEnabledMock).not.toHaveBeenCalled();
      expect(getLastBackupStatusMock).not.toHaveBeenCalled();
      expect(readRecentMock).not.toHaveBeenCalled();
      expect(exportSummaryMock).not.toHaveBeenCalled();
    });
  });

  describe("inside Tauri: mount effects", () => {
    it("calls isEnabled, getLastBackupStatus, readRecent and exportSummary on mount", async () => {
      render(<DesktopSettings />);

      await waitFor(() => expect(isEnabledMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(getLastBackupStatusMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(readRecentMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(exportSummaryMock).toHaveBeenCalledTimes(1));

      expect(screen.getByText("System integration")).toBeInTheDocument();
      expect(screen.getByText("Automatic backup")).toBeInTheDocument();
      expect(screen.getByText("Diagnostics (local log)")).toBeInTheDocument();
      expect(screen.getByText("Command timing summary")).toBeInTheDocument();
    });

    it("logs a warning through logger.warn when each mount call rejects", async () => {
      isEnabledMock.mockRejectedValueOnce(new Error("autostart broke"));
      getLastBackupStatusMock.mockRejectedValueOnce(new Error("status broke"));
      readRecentMock.mockRejectedValueOnce(new Error("logs broke"));
      exportSummaryMock.mockRejectedValueOnce(new Error("summary broke"));

      render(<DesktopSettings />);

      await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledTimes(4));
      const messages = loggerWarnMock.mock.calls.map((call) => call[0] as string);
      expect(messages.some((m) => m.includes("Failed to read autostart state") && m.includes("autostart broke"))).toBe(
        true
      );
      expect(messages.some((m) => m.includes("Failed to refresh backup status") && m.includes("status broke"))).toBe(
        true
      );
      expect(messages.some((m) => m.includes("Failed to refresh diagnostic logs") && m.includes("logs broke"))).toBe(
        true
      );
      expect(
        messages.some((m) => m.includes("Failed to refresh the command timing summary") && m.includes("summary broke"))
      ).toBe(true);
    });
  });

  describe("TMDB vault: save / unlock / lock", () => {
    it("disables Save until both a password and a non-blank token are present", async () => {
      render(<DesktopSettings />);
      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Vault password/), { target: { value: "hunter2" } });
      expect(saveButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/New TMDB Bearer token/), { target: { value: "   " } });
      expect(saveButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/New TMDB Bearer token/), { target: { value: "abc123" } });
      expect(saveButton).not.toBeDisabled();
    });

    it("Save calls tokenVault.save and shows the translated fallback success toast for a non-string result", async () => {
      render(<DesktopSettings />);
      fireEvent.change(screen.getByLabelText(/Vault password/), { target: { value: "hunter2" } });
      fireEvent.change(screen.getByLabelText(/New TMDB Bearer token/), { target: { value: "abc123" } });

      screen.getByRole("button", { name: "Save" }).click();

      await waitFor(() => expect(saveMock).toHaveBeenCalledWith("hunter2", "abc123"));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Operation complete.", variant: "success" })
      );
    });

    it("Unlock (truthy resolution) shows the unlockSuccess toast", async () => {
      unlockMock.mockResolvedValueOnce(true);
      render(<DesktopSettings />);
      fireEvent.change(screen.getByLabelText(/Vault password/), { target: { value: "hunter2" } });

      screen.getByRole("button", { name: "Unlock" }).click();

      await waitFor(() => expect(unlockMock).toHaveBeenCalledWith("hunter2"));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Vault unlocked.", variant: "success" })
      );
    });

    it("Unlock (falsy resolution) shows the unlockNoToken toast", async () => {
      unlockMock.mockResolvedValueOnce(false);
      render(<DesktopSettings />);
      fireEvent.change(screen.getByLabelText(/Vault password/), { target: { value: "hunter2" } });

      screen.getByRole("button", { name: "Unlock" }).click();

      await waitFor(() => expect(unlockMock).toHaveBeenCalledWith("hunter2"));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          description: "Vault opened, but no token registered.",
          variant: "success",
        })
      );
    });

    it("run()'s error path logs via logger.warn and shows the translated fallback error toast", async () => {
      unlockMock.mockRejectedValueOnce(new Error("boom"));
      render(<DesktopSettings />);
      fireEvent.change(screen.getByLabelText(/Vault password/), { target: { value: "hunter2" } });

      screen.getByRole("button", { name: "Unlock" }).click();

      await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("boom")));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Operation failed.", variant: "error" })
      );
    });

    it("Lock calls tokenVault.lock() directly, with no busy state or toast", async () => {
      render(<DesktopSettings />);
      screen.getByRole("button", { name: "Lock" }).click();

      expect(lockMock).toHaveBeenCalledTimes(1);
      expect(toastMock).not.toHaveBeenCalled();
    });
  });

  describe("inside Tauri on mobile (isDesktopApp false)", () => {
    it("hides autostart and check-for-updates but keeps check database, backup and diagnostics", async () => {
      isDesktopAppMock.mockReturnValue(false);
      render(<DesktopSettings />);

      await waitFor(() => expect(getLastBackupStatusMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("button", { name: "Launch at startup" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Check database" })).toBeInTheDocument();
      expect(screen.getByText("Automatic backup")).toBeInTheDocument();
      expect(screen.getByText("Diagnostics (local log)")).toBeInTheDocument();

      await Promise.resolve();
      expect(isEnabledMock).not.toHaveBeenCalled();
    });
  });

  describe("autostart toggle", () => {
    it("enables autostart when currently off, then disables it on a second click", async () => {
      isEnabledMock.mockResolvedValue(false);
      render(<DesktopSettings />);

      const toggle = await screen.findByRole("button", { name: "Launch at startup" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");

      toggle.click();

      await waitFor(() => expect(enableMock).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Autostart enabled.", variant: "success" })
      );
      const disableToggle = await screen.findByRole("button", { name: "Disable autostart" });
      expect(disableToggle).toHaveAttribute("aria-pressed", "true");

      disableToggle.click();

      await waitFor(() => expect(disableMock).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Autostart disabled.", variant: "success" })
      );
      expect(await screen.findByRole("button", { name: "Launch at startup" })).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("check for updates", () => {
    it("calls updateService.checkAndInstall and toasts its resolved message", async () => {
      checkAndInstallMock.mockResolvedValueOnce("Version 1.2.3 installed.");
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Check for updates" }).click();

      await waitFor(() => expect(checkAndInstallMock).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Version 1.2.3 installed.", variant: "success" })
      );
    });
  });

  describe("check database", () => {
    it("shows the healthy message with the interpolated detail", async () => {
      checkDataIntegrityMock.mockResolvedValueOnce({ healthy: true, detail: "0 issues found" });
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Check database" }).click();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          description: "Database healthy: 0 issues found",
          variant: "success",
        })
      );
    });

    it("shows the damaged message with the interpolated detail", async () => {
      checkDataIntegrityMock.mockResolvedValueOnce({ healthy: false, detail: "3 orphan rows" });
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Check database" }).click();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          description: "Database damaged: 3 orphan rows",
          variant: "success",
        })
      );
    });
  });

  describe("emergency backup", () => {
    it("creates a forced backup then refreshes the backup status a second time", async () => {
      render(<DesktopSettings />);
      await waitFor(() => expect(getLastBackupStatusMock).toHaveBeenCalledTimes(1));

      screen.getByRole("button", { name: "Emergency backup" }).click();

      await waitFor(() => expect(createAutomaticBackupMock).toHaveBeenCalledWith(true));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Emergency backup updated.", variant: "success" })
      );
      await waitFor(() => expect(getLastBackupStatusMock).toHaveBeenCalledTimes(2));
    });
  });

  describe("backupStatus render ternary", () => {
    it("renders nothing when backupStatus is null", async () => {
      getLastBackupStatusMock.mockResolvedValue(null);
      render(<DesktopSettings />);
      await waitFor(() => expect(getLastBackupStatusMock).toHaveBeenCalledTimes(1));

      expect(screen.queryByText(/automatic backup/i, { selector: "p" })).not.toBeInTheDocument();
    });

    it("renders the failed message with destructive styling when failed is true", async () => {
      getLastBackupStatusMock.mockResolvedValue({ exportedAt: null, failed: true });
      render(<DesktopSettings />);

      const message = await screen.findByText(
        "The last automatic backup attempt failed — retry with Emergency backup."
      );
      expect(message).toHaveClass("text-destructive");
    });

    it("renders the success message with a formatted relative date when failed is false and exportedAt is set", async () => {
      getLastBackupStatusMock.mockResolvedValue({ exportedAt: "2026-08-18T00:00:00.000Z", failed: false });
      render(<DesktopSettings />);

      const message = await screen.findByText("Last automatic backup: 3 days ago.");
      expect(message).toHaveClass("text-muted-foreground");
      expect(formatRelativeDateMock).toHaveBeenCalledWith("2026-08-18T00:00:00.000Z");
    });

    it("renders the noBackupYet message when failed is false and exportedAt is null", async () => {
      getLastBackupStatusMock.mockResolvedValue({ exportedAt: null, failed: false });
      render(<DesktopSettings />);

      expect(await screen.findByText("No automatic backup yet.")).toBeInTheDocument();
    });
  });

  describe("restore flow", () => {
    it("startRestore shows an error toast and never opens the dialog when there is no automatic backup", async () => {
      getAutomaticBackupInfoMock.mockResolvedValueOnce(null);
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Restore backup" }).click();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({
          description: "No automatic backup was found.",
          variant: "error",
        })
      );
      expect(screen.queryByText("Restore the automatic backup?")).not.toBeInTheDocument();
    });

    it("startRestore opens the ConfirmDialog with the backup date when info is found", async () => {
      getAutomaticBackupInfoMock.mockResolvedValueOnce({ exportedAt: "2026-08-10T00:00:00.000Z" });
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Restore backup" }).click();

      expect(await screen.findByText("Restore the automatic backup?")).toBeInTheDocument();
      expect(formatRelativeDateMock).toHaveBeenCalledWith("2026-08-10T00:00:00.000Z");
    });

    it("confirmRestore success: restores and reloads the page", async () => {
      getAutomaticBackupInfoMock.mockResolvedValueOnce({ exportedAt: "2026-08-10T00:00:00.000Z" });
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Restore backup" }).click();
      await screen.findByText("Restore the automatic backup?");

      const dialogButtons = screen.getAllByRole("button", { name: "Restore backup" });
      dialogButtons[dialogButtons.length - 1]!.click();

      await waitFor(() => expect(restoreAutomaticBackupMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
    });

    it("confirmRestore failure: resets state, logs, shows an error toast, closes the dialog, and never reloads", async () => {
      getAutomaticBackupInfoMock.mockResolvedValueOnce({ exportedAt: "2026-08-10T00:00:00.000Z" });
      restoreAutomaticBackupMock.mockRejectedValueOnce(new Error("disk full"));
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Restore backup" }).click();
      await screen.findByText("Restore the automatic backup?");

      const dialogButtons = screen.getAllByRole("button", { name: "Restore backup" });
      dialogButtons[dialogButtons.length - 1]!.click();

      await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("disk full")));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Operation failed.", variant: "error" })
      );
      await waitFor(() => expect(screen.queryByText("Restore the automatic backup?")).not.toBeInTheDocument());
      expect(window.location.reload).not.toHaveBeenCalled();
    });

    it("the ConfirmDialog closes via onOpenChange when not restoring (e.g. Escape before confirming)", async () => {
      getAutomaticBackupInfoMock.mockResolvedValueOnce({ exportedAt: "2026-08-10T00:00:00.000Z" });
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Restore backup" }).click();
      await screen.findByText("Restore the automatic backup?");

      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

      await waitFor(() => expect(screen.queryByText("Restore the automatic backup?")).not.toBeInTheDocument());
      expect(restoreAutomaticBackupMock).not.toHaveBeenCalled();
    });

    it("the ConfirmDialog refuses to close while isRestoring is true", async () => {
      getAutomaticBackupInfoMock.mockResolvedValueOnce({ exportedAt: "2026-08-10T00:00:00.000Z" });
      let resolveRestore!: () => void;
      restoreAutomaticBackupMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveRestore = resolve;
          })
      );
      render(<DesktopSettings />);

      screen.getByRole("button", { name: "Restore backup" }).click();
      await screen.findByText("Restore the automatic backup?");

      const dialogButtons = screen.getAllByRole("button", { name: "Restore backup" });
      dialogButtons[dialogButtons.length - 1]!.click();

      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());

      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      expect(screen.getByText("Restore the automatic backup?")).toBeInTheDocument();

      resolveRestore();
      await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
    });
  });

  describe("diagnostics", () => {
    it("refresh calls logger.readRecent() again", async () => {
      render(<DesktopSettings />);
      await waitFor(() => expect(readRecentMock).toHaveBeenCalledTimes(1));

      screen.getByRole("button", { name: "Refresh" }).click();

      await waitFor(() => expect(readRecentMock).toHaveBeenCalledTimes(2));
    });

    it("copy is disabled with no logs, enabled once logs load, and writes them to the clipboard", async () => {
      readRecentMock.mockResolvedValue(["[info] started", "[warn] something"]);
      render(<DesktopSettings />);

      const copyButton = await screen.findByRole("button", { name: "Copy" });
      await waitFor(() => expect(copyButton).not.toBeDisabled());

      copyButton.click();

      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("[info] started\n[warn] something")
      );
    });

    it("copy is disabled while logLines is empty/null", async () => {
      readRecentMock.mockResolvedValue(null);
      render(<DesktopSettings />);
      await waitFor(() => expect(readRecentMock).toHaveBeenCalledTimes(1));

      expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    });

    it("clear is disabled while there are no logs, then succeeds: calls clear() and re-reads logs", async () => {
      readRecentMock.mockResolvedValueOnce(["[info] one"]);
      render(<DesktopSettings />);

      const clearButton = await screen.findByRole("button", { name: "Clear" });
      await waitFor(() => expect(clearButton).not.toBeDisabled());

      readRecentMock.mockResolvedValueOnce([]);
      clearButton.click();

      await waitFor(() => expect(clearMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(readRecentMock).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Operation complete.", variant: "success" })
      );
    });

    it("clear failure: logs via logger.error internally, then the outer run() catch logs via logger.warn and shows an error toast", async () => {
      readRecentMock.mockResolvedValueOnce(["[info] one"]);
      render(<DesktopSettings />);

      const clearButton = await screen.findByRole("button", { name: "Clear" });
      await waitFor(() => expect(clearButton).not.toBeDisabled());

      clearMock.mockRejectedValueOnce(new Error("clear failed"));
      clearButton.click();

      await waitFor(() => expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining("clear failed")));
      await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("clear failed")));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith({ description: "Operation failed.", variant: "error" })
      );
    });

    it("renders the log lines in a <pre> when present, and the empty placeholder otherwise", async () => {
      readRecentMock.mockResolvedValueOnce(["line one", "line two"]);
      const { container } = render(<DesktopSettings />);

      await waitFor(() =>
        expect(container.querySelector("pre")).toHaveTextContent("line one\nline two", { normalizeWhitespace: false })
      );

      readRecentMock.mockResolvedValueOnce(null);
      screen.getByRole("button", { name: "Refresh" }).click();

      await waitFor(() => expect(screen.getByText("No log entries yet.")).toBeInTheDocument());
      expect(container.querySelector("pre")).not.toBeInTheDocument();
    });
  });

  describe("command timing summary", () => {
    it("renders the empty placeholder when no commands have been recorded", async () => {
      render(<DesktopSettings />);

      await waitFor(() => expect(exportSummaryMock).toHaveBeenCalledTimes(1));
      expect(screen.getByText("No timed commands recorded yet.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("renders one row per command, sorted by p95 descending, and refresh re-fetches the summary", async () => {
      exportSummaryMock.mockResolvedValue({
        commands: [
          {
            command: "list_library",
            count: 10,
            errorCount: 0,
            avgDurationMs: 4.2,
            p95DurationMs: 8,
            maxDurationMs: 12,
          },
          {
            command: "get_stats_overview",
            count: 3,
            errorCount: 1,
            avgDurationMs: 50,
            p95DurationMs: 220,
            maxDurationMs: 250,
          },
        ],
        totalLinesParsed: 13,
      });
      render(<DesktopSettings />);

      await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
      const rows = screen.getAllByRole("row").slice(1); // drop the header row
      expect(rows[0]).toHaveTextContent("get_stats_overview");
      expect(rows[0]).toHaveTextContent("220");
      expect(rows[1]).toHaveTextContent("list_library");

      exportSummaryMock.mockResolvedValueOnce({ commands: [], totalLinesParsed: 0 });
      screen.getByRole("button", { name: "Refresh summary" }).click();

      await waitFor(() => expect(exportSummaryMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText("No timed commands recorded yet.")).toBeInTheDocument());
    });

    it("copy as JSON is disabled with no data and writes the summary to the clipboard once loaded", async () => {
      const summary = {
        commands: [
          {
            command: "list_library",
            count: 1,
            errorCount: 0,
            avgDurationMs: 4,
            p95DurationMs: 4,
            maxDurationMs: 4,
          },
        ],
        totalLinesParsed: 1,
      };
      exportSummaryMock.mockResolvedValueOnce({ commands: [], totalLinesParsed: 0 }).mockResolvedValueOnce(summary);
      render(<DesktopSettings />);

      expect(screen.getByRole("button", { name: "Copy as JSON" })).toBeDisabled();

      screen.getByRole("button", { name: "Refresh summary" }).click();
      const copyButton = await screen.findByRole("button", { name: "Copy as JSON" });
      await waitFor(() => expect(copyButton).not.toBeDisabled());

      copyButton.click();

      await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(summary, null, 2)));
    });
  });
});
