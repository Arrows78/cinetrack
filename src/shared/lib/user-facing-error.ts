// Marks an Error whose `.message` is already a translated, user-safe string
// — thrown deliberately by app code (e.g. "the selected file is too large")
// — as opposed to an error surfaced from IPC/SQL/network/an auth provider,
// whose `.message` may carry raw technical detail or untranslated text and
// must never reach the UI verbatim (see CLAUDE.md's "never surface
// error.message directly" rule).
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/** `error.message` if it's a UserFacingError, the (already translated) `fallback` otherwise. */
export function displayMessage(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback;
}
