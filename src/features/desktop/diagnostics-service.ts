import { diagnosticsCommands, type DiagnosticsSummary } from "@/features/desktop/diagnostics-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";

export const diagnosticsService = {
  /**
   * The structured counterpart to logger.ts's raw log tail: aggregates
   * every `command=<name> duration=<ms>ms` line (written by both this
   * app's own invoke() wrapper and the Rust-side `diagnostics::timed`
   * every command goes through) into per-command count/avg/p95/max/error
   * stats, so a slow round trip can be spotted without reading the log
   * line by line.
   */
  async exportSummary(): Promise<DiagnosticsSummary> {
    return invokeTypedCommand(diagnosticsCommands.exportSummary);
  },
};
