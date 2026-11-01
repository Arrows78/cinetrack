import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerWarnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args) },
}));

import { readSyncRunHistory, recordSyncRun, SYNC_RUN_HISTORY_EVENT, SYNC_RUN_HISTORY_LIMIT } from "../sync-run-history";

describe("sync run history", () => {
  beforeEach(() => {
    localStorage.clear();
    loggerWarnMock.mockReset();
  });

  it("stores newest runs first and caps the device-local history", () => {
    for (let index = 0; index < SYNC_RUN_HISTORY_LIMIT + 3; index += 1) {
      recordSyncRun("profile-1", {
        at: `2026-11-01T00:00:${String(index).padStart(2, "0")}.000Z`,
        outcome: "success",
        pushed: index,
        pulled: 0,
        conflicts: 0,
      });
    }

    const history = readSyncRunHistory("profile-1");
    expect(history).toHaveLength(SYNC_RUN_HISTORY_LIMIT);
    expect(history[0]?.pushed).toBe(SYNC_RUN_HISTORY_LIMIT + 2);
    expect(history[history.length - 1]?.pushed).toBe(3);
  });

  it("ignores malformed persisted entries instead of breaking Settings", () => {
    localStorage.setItem(
      "cinetrack.sync-run-history.v1:profile-1",
      JSON.stringify([{ at: "ok", outcome: "success", pushed: 1, pulled: 2, conflicts: 0 }, { nope: true }])
    );

    expect(readSyncRunHistory("profile-1")).toEqual([
      { at: "ok", outcome: "success", pushed: 1, pulled: 2, conflicts: 0 },
    ]);
  });

  it("notifies the current window after recording a run", () => {
    const listener = vi.fn();
    window.addEventListener(SYNC_RUN_HISTORY_EVENT, listener);

    recordSyncRun("profile-1", {
      at: "2026-11-01T12:00:00.000Z",
      outcome: "failure",
      pushed: 1,
      pulled: 2,
      conflicts: 1,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SYNC_RUN_HISTORY_EVENT, listener);
  });
});
