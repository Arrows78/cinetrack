import { defineCommand } from "@/shared/lib/invoke";
import type { DiagnosticsSummary } from "@/generated/dto/DiagnosticsSummary";

export type { CommandTimingSummary } from "@/generated/dto/CommandTimingSummary";
export type { DiagnosticsSummary } from "@/generated/dto/DiagnosticsSummary";
export type { DiagnosticsLayer } from "@/generated/dto/DiagnosticsLayer";

export const diagnosticsCommands = {
  exportSummary: defineCommand<undefined, DiagnosticsSummary>("export_diagnostics_summary"),
} as const;
