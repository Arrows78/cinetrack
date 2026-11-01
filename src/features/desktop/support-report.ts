import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { type as osType } from "@tauri-apps/plugin-os";
import { shareFile } from "@choochmeque/tauri-plugin-sharekit-api";

import { maintenanceService } from "@/features/backup/maintenance-service";
import { diagnosticsService } from "@/features/desktop/diagnostics-service";
import { syncRepository } from "@/features/sync/sync-repository";
import { logger } from "@/shared/lib/logger";
import { isMobileApp } from "@/shared/lib/platform";

const SUPPORT_CACHE_SUBDIR = "support";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const OAUTH_NONCE_PATTERN = /(rotating_token_nonce=)[^&#\s]+/gi;
const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi;

export function redactDiagnosticLine(line: string): string {
  return line
    .replace(OAUTH_NONCE_PATTERN, "$1<redacted>")
    .replace(BEARER_PATTERN, "$1<redacted>")
    .replace(EMAIL_PATTERN, "<email-redacted>");
}

async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export async function buildSupportReport() {
  const [appVersion, tauriVersion, database, backup, sync, timings, logs] = await Promise.all([
    optional(() => getVersion()),
    optional(() => getTauriVersion()),
    optional(() => maintenanceService.checkDataIntegrity()),
    optional(() => maintenanceService.getLastBackupStatus()),
    optional(() => syncRepository.getStatus()),
    optional(() => diagnosticsService.exportSummary()),
    optional(() => logger.readRecent(300)),
  ]);

  return {
    format: "cinetrack-support-report",
    version: 1,
    generatedAt: new Date().toISOString(),
    app: {
      version: appVersion,
      tauriVersion,
      platform: osType(),
    },
    database,
    backup,
    sync: sync
      ? {
          cursor: sync.cursor,
          pendingCount: sync.pendingCount,
          failedCount: sync.failedCount,
          conflictCount: sync.conflictCount,
          lastSyncedAt: sync.lastSyncedAt,
        }
      : null,
    timings,
    logs: logs?.map(redactDiagnosticLine) ?? null,
  };
}

function downloadText(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function shareText(contents: string, filename: string): Promise<void> {
  await mkdir(SUPPORT_CACHE_SUBDIR, { baseDir: BaseDirectory.AppCache, recursive: true });
  const relativePath = `${SUPPORT_CACHE_SUBDIR}/${filename}`;
  await writeFile(relativePath, new TextEncoder().encode(contents), { baseDir: BaseDirectory.AppCache });
  const absolutePath = await join(await appCacheDir(), relativePath);
  await shareFile(`file://${absolutePath}`, { mimeType: "application/json", title: filename });
}

export async function exportSupportReport(): Promise<void> {
  const report = await buildSupportReport();
  const contents = JSON.stringify(report, null, 2);
  const filename = `cinetrack-support-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

  if (isMobileApp()) await shareText(contents, filename);
  else downloadText(contents, filename);
}
