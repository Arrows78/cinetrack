import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  getTauriVersion: vi.fn(),
  osType: vi.fn(),
  checkDataIntegrity: vi.fn(),
  getLastBackupStatus: vi.fn(),
  getSyncStatus: vi.fn(),
  exportSummary: vi.fn(),
  readRecent: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mocks.getVersion(),
  getTauriVersion: () => mocks.getTauriVersion(),
}));
vi.mock("@tauri-apps/plugin-os", () => ({ type: () => mocks.osType() }));
vi.mock("@tauri-apps/api/path", () => ({ appCacheDir: vi.fn(), join: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppCache: "AppCache" },
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("@choochmeque/tauri-plugin-sharekit-api", () => ({ shareFile: vi.fn() }));
vi.mock("@/features/backup/maintenance-service", () => ({
  maintenanceService: {
    checkDataIntegrity: () => mocks.checkDataIntegrity(),
    getLastBackupStatus: () => mocks.getLastBackupStatus(),
  },
}));
vi.mock("@/features/sync/sync-repository", () => ({
  syncRepository: { getStatus: () => mocks.getSyncStatus() },
}));
vi.mock("@/features/desktop/diagnostics-service", () => ({
  diagnosticsService: { exportSummary: () => mocks.exportSummary() },
}));
vi.mock("@/shared/lib/logger", () => ({
  logger: { readRecent: (...args: unknown[]) => mocks.readRecent(...args) },
}));
vi.mock("@/shared/lib/platform", () => ({ isMobileApp: () => false }));

import { buildSupportReport, redactDiagnosticLine } from "../support-report";

describe("support report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVersion.mockResolvedValue("0.4.1");
    mocks.getTauriVersion.mockResolvedValue("2.9.0");
    mocks.osType.mockReturnValue("macos");
    mocks.checkDataIntegrity.mockResolvedValue({ healthy: true, detail: "ok" });
    mocks.getLastBackupStatus.mockResolvedValue({ exportedAt: "2026-11-01T12:00:00.000Z", failed: false });
    mocks.getSyncStatus.mockResolvedValue({
      deviceId: "private-device-id",
      cursor: 42,
      pendingCount: 1,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: "2026-11-01T12:30:00.000Z",
    });
    mocks.exportSummary.mockResolvedValue({ commands: [], totalLinesParsed: 0 });
    mocks.readRecent.mockResolvedValue([
      "Handling cinetrack://auth/callback?rotating_token_nonce=secret",
      "user alice@example.com failed",
    ]);
  });

  it("redacts OAuth nonces, bearer tokens and email addresses", () => {
    expect(
      redactDiagnosticLine("alice@example.com rotating_token_nonce=abc123 Authorization Bearer secret.jwt")
    ).toBe("<email-redacted> rotating_token_nonce=<redacted> Authorization Bearer <redacted>");
  });

  it("builds a useful report without exposing the sync device identifier", async () => {
    const report = await buildSupportReport();

    expect(report.app).toEqual({ version: "0.4.1", tauriVersion: "2.9.0", platform: "macos" });
    expect(report.sync).toEqual({
      cursor: 42,
      pendingCount: 1,
      failedCount: 0,
      conflictCount: 0,
      lastSyncedAt: "2026-11-01T12:30:00.000Z",
    });
    expect(JSON.stringify(report)).not.toContain("private-device-id");
    expect(report.logs).toEqual([
      "Handling cinetrack://auth/callback?rotating_token_nonce=<redacted>",
      "user <email-redacted> failed",
    ]);
  });
});
