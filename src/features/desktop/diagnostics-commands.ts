import { defineCommand } from "@/shared/lib/invoke";

export interface CommandTimingSummary {
  command: string;
  count: number;
  errorCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
}

export interface DiagnosticsSummary {
  commands: CommandTimingSummary[];
  totalLinesParsed: number;
}

export const diagnosticsCommands = {
  exportSummary: defineCommand<undefined, DiagnosticsSummary>("export_diagnostics_summary"),
} as const;
