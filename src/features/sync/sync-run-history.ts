import { syncRunHistoryKey } from "@/shared/constants/local-storage-keys";
import { logger } from "@/shared/lib/logger";

export const SYNC_RUN_HISTORY_LIMIT = 20;
export const SYNC_RUN_HISTORY_EVENT = "cinetrack:sync-run-history-changed";

export interface SyncRunHistoryEntry {
  at: string;
  outcome: "success" | "failure";
  pushed: number;
  pulled: number;
  conflicts: number;
}

function isEntry(value: unknown): value is SyncRunHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SyncRunHistoryEntry>;
  return (
    typeof entry.at === "string" &&
    (entry.outcome === "success" || entry.outcome === "failure") &&
    Number.isInteger(entry.pushed) &&
    Number.isInteger(entry.pulled) &&
    Number.isInteger(entry.conflicts) &&
    (entry.pushed ?? -1) >= 0 &&
    (entry.pulled ?? -1) >= 0 &&
    (entry.conflicts ?? -1) >= 0
  );
}

export function readSyncRunHistory(profileId: string): SyncRunHistoryEntry[] {
  try {
    const raw = localStorage.getItem(syncRunHistoryKey(profileId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, SYNC_RUN_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function recordSyncRun(profileId: string, entry: SyncRunHistoryEntry): void {
  try {
    const next = [entry, ...readSyncRunHistory(profileId)].slice(0, SYNC_RUN_HISTORY_LIMIT);
    localStorage.setItem(syncRunHistoryKey(profileId), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(SYNC_RUN_HISTORY_EVENT, { detail: { profileId } }));
  } catch (error) {
    // History is diagnostic/UX metadata only; never let quota/privacy-mode
    // storage failures turn a successful cloud sync into a failed one.
    logger.warn(`Could not persist sync run history: ${error instanceof Error ? error.message : String(error)}`);
  }
}
