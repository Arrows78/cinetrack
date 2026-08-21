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
