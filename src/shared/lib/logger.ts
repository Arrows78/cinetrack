import { BaseDirectory, exists, mkdir, readTextFile, remove, rename, stat, writeTextFile } from "@tauri-apps/plugin-fs";
import { isTauriApp } from "@/shared/lib/platform";

// Background maintenance (backup, availability checks, notifications,
// desktop init) previously only ever logged to console.warn — invisible
// once the devtools console is closed, and gone entirely on the next
// restart. This gives those failures a local, rotating file so a user
// (or whoever is helping them) can actually see what went wrong, without
// any remote telemetry.
const LOG_DIR = "logs";
const LOG_FILE = `${LOG_DIR}/cinetrack.log`;
const ROTATED_LOG_FILE = `${LOG_FILE}.1`;
// A debugging aid, not an archive — rotate before the file grows
// unbounded, keeping one previous generation so a rotation right before
// something worth investigating doesn't erase the evidence.
const MAX_LOG_BYTES = 512 * 1024;

type LogLevel = "info" | "warn" | "error";

async function rotateIfNeeded(): Promise<void> {
  try {
    const info = await stat(LOG_FILE, { baseDir: BaseDirectory.AppData });
    if (info.size <= MAX_LOG_BYTES) return;
    await remove(ROTATED_LOG_FILE, { baseDir: BaseDirectory.AppData }).catch(() => undefined);
    await rename(LOG_FILE, ROTATED_LOG_FILE, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  } catch {
    // No log file yet — nothing to rotate.
  }
}

async function appendLine(level: LogLevel, message: string): Promise<void> {
  if (!isTauriApp()) return;
  try {
    await mkdir(LOG_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    await rotateIfNeeded();
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}\n`;
    await writeTextFile(LOG_FILE, line, { baseDir: BaseDirectory.AppData, append: true });
  } catch {
    // Logging must never itself throw and mask the caller's real error.
  }
}

async function readFileIfPresent(path: string): Promise<string> {
  try {
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return "";
    return await readTextFile(path, { baseDir: BaseDirectory.AppData });
  } catch {
    return "";
  }
}

export const logger = {
  info(message: string): void {
    console.info(message);
    void appendLine("info", message);
  },
  warn(message: string): void {
    console.warn(message);
    void appendLine("warn", message);
  },
  error(message: string): void {
    console.error(message);
    void appendLine("error", message);
  },

  /** Most recent log lines first the rotated file, then the current one — for the Settings diagnostics view. */
  async readRecent(maxLines = 200): Promise<string[]> {
    if (!isTauriApp()) return [];
    const [rotated, current] = await Promise.all([readFileIfPresent(ROTATED_LOG_FILE), readFileIfPresent(LOG_FILE)]);
    const lines = `${rotated}${current}`.split("\n").filter(Boolean);
    return lines.slice(-maxLines);
  },

  async clear(): Promise<void> {
    if (!isTauriApp()) return;
    await Promise.all([
      writeTextFile(LOG_FILE, "", { baseDir: BaseDirectory.AppData }).catch(() => undefined),
      remove(ROTATED_LOG_FILE, { baseDir: BaseDirectory.AppData }).catch(() => undefined),
    ]);
  },
};
