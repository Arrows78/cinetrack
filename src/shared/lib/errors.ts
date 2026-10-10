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

/** TMDB (or its proxy) answered 429: a transient condition, not a broken setup. */
export const isRateLimitedError = (error: unknown): boolean =>
  (error as { status?: number } | null)?.status === 429;

/** Classify known transport errors without relying on a single formatted string. */
export const errorCategory = (error: unknown): ErrorCategory => {
  const candidate = error as { status?: number; message?: string } | null;
  const message = errorMessage(error);
  // Checked first: a rate-limit body must never be read as an auth failure
  // because its text happens to mention a token or a quota.
  if (isRateLimitedError(error)) return "connection";
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

/**
 * Whether a failed *refetch* (query.isRefetchError — the query previously
 * succeeded and still has that data, see TanStack Query's
 * QueryObserverRefetchErrorResult) should degrade to "keep showing that
 * cached data, with a contextual badge" (see DegradedModeBadge) instead of
 * replacing the whole section with RemoteErrorState.
 *
 * Only "connection" failures qualify: an authentication error needs the
 * user to actually fix something (renew the TMDB token), so hiding it
 * behind stale data would bury an actionable problem rather than surface it.
 */
export const isDegradedRemoteError = (error: unknown): boolean => errorCategory(error) === "connection";
