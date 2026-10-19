import i18n from "@/i18n";
import { isRateLimitedError } from "@/shared/lib/errors";

// The Rust PIN attempt limit (src-tauri/src/profiles/pin.rs) answers 429 with
// "... Try again in N seconds." while a profile is locked after too many wrong PINs.
const RETRY_SECONDS = /in (\d+) seconds?/;

/**
 * The translated "too many attempts" message when `error` is the backend refusing a PIN attempt
 * because the profile is temporarily locked, or null for any other error. The wait is read from
 * the backend's message so the number shown is the real one; the wording itself is local.
 */
export function pinLockMessage(error: unknown): string | null {
  if (!isRateLimitedError(error)) return null;
  const message = (error as { message?: unknown }).message;
  const seconds = typeof message === "string" ? RETRY_SECONDS.exec(message)?.[1] : undefined;
  return seconds
    ? i18n.t("settings.profiles.pin.lockedWithDelay", { seconds: Number(seconds) })
    : i18n.t("settings.profiles.pin.lockedNoDelay");
}
