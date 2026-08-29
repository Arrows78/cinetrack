import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticsSummary } from "../diagnostics-commands";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

describe("diagnosticsService.exportSummary", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invokes export_diagnostics_summary with no args and returns its result", async () => {
    const summary: DiagnosticsSummary = {
      commands: [
        { command: "list_library", count: 4, errorCount: 0, avgDurationMs: 5, p95DurationMs: 8, maxDurationMs: 9 },
      ],
      totalLinesParsed: 4,
    };
    invokeMock.mockResolvedValueOnce(summary);
    const { diagnosticsService } = await import("../diagnostics-service");

    await expect(diagnosticsService.exportSummary()).resolves.toEqual(summary);
    expect(invokeMock).toHaveBeenCalledWith("export_diagnostics_summary", undefined);
  });
});
