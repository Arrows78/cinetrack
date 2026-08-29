import { diagnosticsCommands, type DiagnosticsSummary } from "@/features/desktop/diagnostics-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";

export const diagnosticsService = {
  /**
   * The structured counterpart to logger.ts's raw log tail: aggregates
   * every `layer=<frontend|backend> command=<name> duration=<ms>ms` line
   * (written by both this app's own invoke() wrapper and the Rust-side
   * `diagnostics::timed` every command goes through) into per-(layer,
   * command) count/avg/p95/max/error stats — kept separate by layer since
   * the frontend's line is a full round trip and the backend's is only its
   * own execution time, two different measurements — so a slow round trip
   * can be spotted, and traced to whichever side actually spent the time,
   * without reading the log line by line.
   */
  async exportSummary(): Promise<DiagnosticsSummary> {
    return invokeTypedCommand(diagnosticsCommands.exportSummary);
  },
};
