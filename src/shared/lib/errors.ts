/**
 * Centralized error-message extraction. Every call-site that needs to display
 * or log an `unknown` error should use this instead of duplicating the logic.
 *
 * Resolution order:
 *   1. `Error.message` (native errors, custom error classes)
 *   2. Raw string (already a message)
 *   3. `JSON.stringify` (structured IPC / API errors)
 *   4. `String(error)` (fallback for numbers, booleans, symbols, …)
 */
export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export type ErrorCategory = "authentication" | "localDatabase" | "connection";

/** Classify known transport errors without relying on a single formatted string. */
export const errorCategory = (error: unknown): ErrorCategory => {
  const candidate = error as { status?: number; message?: string } | null;
  const message = errorMessage(error);
  if (candidate && (candidate.status === 401 || candidate.status === 403)) return "authentication";
  if (/TMDB\s+(401|403)|token/i.test(message)) return "authentication";
  if (candidate?.status && candidate.status >= 500 && /sql|sqlite|database|plugin:sql/i.test(message)) {
    return "localDatabase";
  }
  if (/sql\.(execute|select|load|close) not allowed|plugin:sql|sqlite|database/i.test(message)) {
    return "localDatabase";
  }
  return "connection";
};
