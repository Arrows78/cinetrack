import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import type * as PortableDataModule from "@/features/backup/portable-data";
import type * as PreferencesRepositoryModule from "@/features/preferences/preferences-repository";
import type { UserPreferences } from "@/types/media";
import { BackupTools } from "../backup-tools";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const loggerWarnMock = vi.fn();
vi.mock("@/features/diagnostics/logger", () => ({
  logger: { info: vi.fn(), warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn() },
}));

const exportMock = vi.fn();
vi.mock("@/features/backup/portable-data", async (importOriginal) => {
  const actual = await importOriginal<typeof PortableDataModule>();
  return { ...actual, portableData: { export: (...args: unknown[]) => exportMock(...args) } };
});

const restoreFromBackupMock = vi.fn();
const undoLastRestoreMock = vi.fn();
vi.mock("@/features/backup/maintenance-service", () => ({
  maintenanceService: {
    restoreFromBackup: (...args: unknown[]) => restoreFromBackupMock(...args),
    undoLastRestore: (...args: unknown[]) => undoLastRestoreMock(...args),
  },
}));

const getPreferencesMock = vi.fn();
const updatePreferenceMock = vi.fn();
// Partial mock (keeps preferencesSchema/defaultPreferences from the real
// module, per the task brief's guidance to import real constants rather
// than guessing) — portable-data.ts's backup-schema.ts imports
// preferencesSchema from this same module, so a full replacement here
// breaks that unrelated import chain, which BackupTools also pulls in.
vi.mock("@/features/preferences/preferences-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof PreferencesRepositoryModule>();
  return {
    ...actual,
    preferencesRepository: {
      ...actual.preferencesRepository,
      getPreferences: (...args: unknown[]) => getPreferencesMock(...args),
      updatePreference: (...args: unknown[]) => updatePreferenceMock(...args),
    },
  };
});

const openDialogMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...args: unknown[]) => openDialogMock(...args) }));

// Imported after mocking so this is the real, un-mocked constant (per the
// task brief: "import the real constant rather than guessing its value").
const { MAX_BACKUP_FILE_BYTES } = await vi.importActual<typeof PortableDataModule>("@/features/backup/portable-data");

const SAMPLE_BACKUP = { format: "cinetrack-backup", version: 1, exportedAt: "2026-08-01T00:00:00.000Z", data: {} };

const BASE_PREFERENCES: UserPreferences = {
  theme: "dark",
  accentColor: "violet",
  language: "en",
  region: "FR",
  defaultSearchType: "all",
  reduceMotion: false,
  compactMode: false,
  sidebarCollapsed: false,
  libraryViewMode: "grid",
  spoilerProtection: true,
  notificationsEnabled: false,
  notifyHoursBefore: 24,
  preferredProviderIds: [],
  activeProfileId: "default",
  backupDirectory: null,
  userProfile: { id: "default", name: null },
};

function jsonFile(name: string, value: unknown, size?: number): File {
  const file = new File([JSON.stringify(value)], name, { type: "application/json" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

function getFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input as HTMLInputElement;
}

// BackupTools reads the backup folder via usePreferences() (TanStack
// Query), so every render needs a QueryClientProvider — matching the
// pattern settings-page.test.tsx already uses for the same hook.
function renderBackupTools() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<BackupTools />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("BackupTools", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    toastMock.mockReset();
    loggerWarnMock.mockReset();
    exportMock.mockReset().mockResolvedValue(SAMPLE_BACKUP);
    restoreFromBackupMock.mockReset().mockResolvedValue(undefined);
    undoLastRestoreMock.mockReset().mockResolvedValue(undefined);
    getPreferencesMock.mockReset().mockResolvedValue(BASE_PREFERENCES);
    updatePreferenceMock.mockReset();
    openDialogMock.mockReset();

    // jsdom doesn't implement these; the component calls them directly.
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();

    // jsdom throws "not implemented: navigation" on a real reload.
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
  });

  describe("export", () => {
    it("exports, downloads a dated file, and shows a success toast", async () => {
      renderBackupTools();
      const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

      screen.getByRole("button", { name: "Export" }).click();

      await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(anchorClickSpy).toHaveBeenCalledTimes(1));

      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      const anchor = anchorClickSpy.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toMatch(/^cinetrack-backup-\d{4}-\d{2}-\d{2}\.json$/);

      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })));

      anchorClickSpy.mockRestore();
    });

    it("disables the export button while the export is in flight", async () => {
      let resolveExport!: (value: typeof SAMPLE_BACKUP) => void;
      exportMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveExport = resolve;
          })
      );
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
      renderBackupTools();

      const exportButton = screen.getByRole("button", { name: "Export" });
      exportButton.click();

      await waitFor(() => expect(exportButton).toBeDisabled());

      resolveExport(SAMPLE_BACKUP);

      await waitFor(() => expect(exportButton).not.toBeDisabled());
    });

    it("shows an error toast (not a crash) when export() rejects", async () => {
      exportMock.mockRejectedValueOnce(new Error("boom"));
      renderBackupTools();

      screen.getByRole("button", { name: "Export" }).click();

      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })));
      expect(screen.getByRole("button", { name: "Export" })).not.toBeDisabled();
    });
  });

  describe("import", () => {
    it("clicking the Import trigger button opens the native file picker", () => {
      const { container } = renderBackupTools();
      const input = getFileInput(container);
      const clickSpy = vi.spyOn(input, "click").mockImplementation(() => undefined);

      screen.getByRole("button", { name: "Import" }).click();

      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it("selecting no file leaves the confirmation dialog closed", () => {
      const { container } = renderBackupTools();
      const input = getFileInput(container);

      fireEvent.change(input, { target: { files: [] } });

      expect(screen.queryByText("Replace all your data?")).not.toBeInTheDocument();
    });

    it("the Cancel button closes the import confirmation dialog when not importing", async () => {
      const { container } = renderBackupTools();
      const input = getFileInput(container);

      fireEvent.change(input, { target: { files: [jsonFile("backup.json", SAMPLE_BACKUP)] } });
      await screen.findByText("Replace all your data?");

      screen.getByRole("button", { name: "Cancel" }).click();

      await waitFor(() => expect(screen.queryByText("Replace all your data?")).not.toBeInTheDocument());
      expect(restoreFromBackupMock).not.toHaveBeenCalled();
    });

    it("opens the import confirmation dialog after a file is selected", async () => {
      const { container } = renderBackupTools();
      const input = getFileInput(container);

      fireEvent.change(input, { target: { files: [jsonFile("backup.json", SAMPLE_BACKUP)] } });

      expect(await screen.findByText("Replace all your data?")).toBeInTheDocument();
    });

    it("rejects an oversized file without calling restoreFromBackup, and shows the file-too-large error", async () => {
      const { container } = renderBackupTools();
      const input = getFileInput(container);
      const oversized = jsonFile("backup.json", SAMPLE_BACKUP, MAX_BACKUP_FILE_BYTES + 1);

      fireEvent.change(input, { target: { files: [oversized] } });
      (await screen.findByRole("button", { name: "Import" })).click();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({ description: "This file is too large to be a valid backup.", variant: "error" })
        )
      );
      expect(restoreFromBackupMock).not.toHaveBeenCalled();
    });

    it("parses a valid file, restores it, and reloads the page", async () => {
      const { container } = renderBackupTools();
      const input = getFileInput(container);
      const file = jsonFile("backup.json", SAMPLE_BACKUP);
      const parseSpy = vi.spyOn(JSON, "parse");

      fireEvent.change(input, { target: { files: [file] } });
      (await screen.findByRole("button", { name: "Import" })).click();

      await waitFor(() => expect(restoreFromBackupMock).toHaveBeenCalledTimes(1));
      expect(parseSpy).toHaveBeenCalled();
      expect(restoreFromBackupMock).toHaveBeenCalledWith(SAMPLE_BACKUP);
      await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));

      parseSpy.mockRestore();
    });

    it("on restoreFromBackup failure: logs, shows the translated fallback, closes the dialog, resets isImporting, and never reloads", async () => {
      restoreFromBackupMock.mockRejectedValueOnce(new Error("raw sql detail that must never reach the user"));
      const { container } = renderBackupTools();
      const input = getFileInput(container);

      fireEvent.change(input, { target: { files: [jsonFile("backup.json", SAMPLE_BACKUP)] } });
      (await screen.findByRole("button", { name: "Import" })).click();

      await waitFor(() => expect(restoreFromBackupMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledTimes(1));
      expect(loggerWarnMock.mock.calls[0]?.[0]).toContain("raw sql detail");

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            description: "Import failed: the backup file is invalid or corrupted.",
            variant: "error",
          })
        )
      );

      await waitFor(() => expect(screen.queryByText("Replace all your data?")).not.toBeInTheDocument());
      expect(window.location.reload).not.toHaveBeenCalled();

      // Dialog closed means pendingImportFile reset — selecting again should still work.
      fireEvent.change(getFileInput(container), { target: { files: [jsonFile("backup.json", SAMPLE_BACKUP)] } });
      expect(await screen.findByRole("button", { name: "Import" })).not.toBeDisabled();
    });

    it("the import ConfirmDialog refuses to close while isImporting is true", async () => {
      let resolveRestore!: () => void;
      restoreFromBackupMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveRestore = resolve;
          })
      );
      const { container } = renderBackupTools();
      const input = getFileInput(container);

      fireEvent.change(input, { target: { files: [jsonFile("backup.json", SAMPLE_BACKUP)] } });
      (await screen.findByRole("button", { name: "Import" })).click();

      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());

      // Attempting to close (e.g. Escape key) must be a no-op while importing.
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      expect(screen.getByText("Replace all your data?")).toBeInTheDocument();

      // Success reloads the page rather than closing the dialog via state —
      // resolve just to let the pending promise settle cleanly.
      resolveRestore();
      await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
    });
  });

  describe("undo last import", () => {
    it("the Cancel button closes the undo confirmation dialog when not undoing", async () => {
      renderBackupTools();

      screen.getByRole("button", { name: "Undo last change" }).click();
      await screen.findByText("Undo the last import?");

      screen.getByRole("button", { name: "Cancel" }).click();

      await waitFor(() => expect(screen.queryByText("Undo the last import?")).not.toBeInTheDocument());
      expect(undoLastRestoreMock).not.toHaveBeenCalled();
    });

    it("opens the undo confirmation dialog", async () => {
      renderBackupTools();

      screen.getByRole("button", { name: "Undo last change" }).click();

      expect(await screen.findByText("Undo the last import?")).toBeInTheDocument();
    });

    it("confirming calls undoLastRestore then reloads", async () => {
      renderBackupTools();

      screen.getByRole("button", { name: "Undo last change" }).click();
      await screen.findByText("Undo the last import?");
      const dialogButtons = screen.getAllByRole("button", { name: "Undo last change" });
      dialogButtons[dialogButtons.length - 1]!.click();

      await waitFor(() => expect(undoLastRestoreMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
    });

    it("on undoLastRestore failure: shows an error toast, resets isUndoing, and never reloads", async () => {
      undoLastRestoreMock.mockRejectedValueOnce(new Error("no snapshot"));
      renderBackupTools();

      screen.getByRole("button", { name: "Undo last change" }).click();
      await screen.findByText("Undo the last import?");
      const dialogButtons = screen.getAllByRole("button", { name: "Undo last change" });
      dialogButtons[dialogButtons.length - 1]!.click();

      await waitFor(() => expect(undoLastRestoreMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })));
      expect(window.location.reload).not.toHaveBeenCalled();

      // Dialog closed and isUndoing reset: the trigger button is usable again.
      expect(screen.queryByText("Undo the last import?")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Undo last change" })).not.toBeDisabled();
    });

    it("the undo ConfirmDialog refuses to close while isUndoing is true", async () => {
      let resolveUndo!: () => void;
      undoLastRestoreMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveUndo = resolve;
          })
      );
      renderBackupTools();

      screen.getByRole("button", { name: "Undo last change" }).click();
      await screen.findByText("Undo the last import?");
      const dialogButtons = screen.getAllByRole("button", { name: "Undo last change" });
      dialogButtons[dialogButtons.length - 1]!.click();

      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());

      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      expect(screen.getByText("Undo the last import?")).toBeInTheDocument();

      // Success reloads the page rather than closing the dialog via state —
      // resolve just to let the pending promise settle cleanly.
      resolveUndo();
      await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
    });
  });

  describe("backup folder", () => {
    it("shows the default location when no custom directory is set", async () => {
      renderBackupTools();

      expect(await screen.findByText("Default (app data folder)")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
    });

    it("shows the current custom directory, with a reset button, when one is set", async () => {
      getPreferencesMock.mockReset().mockResolvedValue({ ...BASE_PREFERENCES, backupDirectory: "/Users/alex/iCloud" });
      renderBackupTools();

      expect(await screen.findByText("Current folder: /Users/alex/iCloud")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset to default" })).toBeInTheDocument();
    });

    it("picking a folder updates the backupDirectory preference", async () => {
      openDialogMock.mockResolvedValueOnce("/Users/alex/Dropbox/CineTrack");
      updatePreferenceMock.mockResolvedValueOnce({
        ...BASE_PREFERENCES,
        backupDirectory: "/Users/alex/Dropbox/CineTrack",
      });
      renderBackupTools();

      screen.getByRole("button", { name: "Choose backup folder" }).click();

      await waitFor(() => expect(openDialogMock).toHaveBeenCalledWith({ directory: true }));
      await waitFor(() =>
        expect(updatePreferenceMock).toHaveBeenCalledWith("backupDirectory", "/Users/alex/Dropbox/CineTrack")
      );
      expect(await screen.findByText("Current folder: /Users/alex/Dropbox/CineTrack")).toBeInTheDocument();
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })));
    });

    it("canceling the folder picker (a null result) is a no-op", async () => {
      openDialogMock.mockResolvedValueOnce(null);
      renderBackupTools();

      screen.getByRole("button", { name: "Choose backup folder" }).click();

      await waitFor(() => expect(openDialogMock).toHaveBeenCalledTimes(1));
      expect(updatePreferenceMock).not.toHaveBeenCalled();
      expect(toastMock).not.toHaveBeenCalled();
      // Still showing the default location — nothing changed.
      expect(await screen.findByText("Default (app data folder)")).toBeInTheDocument();
    });

    it("shows a translated error toast (not the raw error) when picking a folder fails", async () => {
      openDialogMock.mockRejectedValueOnce(new Error("raw os-level detail that must never reach the user"));
      renderBackupTools();

      screen.getByRole("button", { name: "Choose backup folder" }).click();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            description: "Couldn't update the backup folder. Please try again.",
            variant: "error",
          })
        )
      );
      expect(loggerWarnMock).toHaveBeenCalledTimes(1);
      expect(loggerWarnMock.mock.calls[0]?.[0]).toContain("raw os-level detail");
    });

    it("resetting clears the backup folder back to the default", async () => {
      getPreferencesMock.mockReset().mockResolvedValue({ ...BASE_PREFERENCES, backupDirectory: "/Users/alex/iCloud" });
      updatePreferenceMock.mockResolvedValueOnce({ ...BASE_PREFERENCES, backupDirectory: null });
      renderBackupTools();
      await screen.findByRole("button", { name: "Reset to default" });

      screen.getByRole("button", { name: "Reset to default" }).click();

      await waitFor(() => expect(updatePreferenceMock).toHaveBeenCalledWith("backupDirectory", null));
      expect(await screen.findByText("Default (app data folder)")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })));
    });

    it("shows a translated error toast (not the raw error) when resetting fails", async () => {
      getPreferencesMock.mockReset().mockResolvedValue({ ...BASE_PREFERENCES, backupDirectory: "/Users/alex/iCloud" });
      updatePreferenceMock.mockRejectedValueOnce(new Error("raw sql detail that must never reach the user"));
      renderBackupTools();
      await screen.findByRole("button", { name: "Reset to default" });

      screen.getByRole("button", { name: "Reset to default" }).click();

      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            description: "Couldn't update the backup folder. Please try again.",
            variant: "error",
          })
        )
      );
      expect(loggerWarnMock).toHaveBeenCalledTimes(1);
      expect(loggerWarnMock.mock.calls[0]?.[0]).toContain("raw sql detail");
    });
  });
});
