import { clerkConfig, bootstrapClerkInstance, getClerkInstance } from "@/shared/lib/clerk-instance";
import { isTauriApp } from "@/shared/lib/platform";

export type SocialAuthProvider = "apple" | "facebook" | "google" | "x";

export { bootstrapClerkInstance, getClerkInstance };

function readInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(maximum, Math.max(minimum, parsed));
}

export const authConfig = {
  configured: clerkConfig.configured,
  required: import.meta.env.VITE_AUTH_REQUIRED === "true",
  // Clerk's email one-time code is a fixed 6-digit code — unlike Supabase's
  // Auth settings, Clerk doesn't expose a per-instance configurable length,
  // so this is no longer read from an env var (VITE_AUTH_OTP_LENGTH is gone).
  otpLength: 6,
  otpResendSeconds: readInteger(import.meta.env.VITE_AUTH_OTP_RESEND_SECONDS, 60, 30, 300),
  termsUrl: import.meta.env.VITE_TERMS_URL?.trim() || undefined,
  privacyUrl: import.meta.env.VITE_PRIVACY_URL?.trim() || undefined,
};

// Keep in sync with `LISTEN_ADDR` + `CALLBACK_PATH` in
// `src-tauri/src/auth/oauth_callback.rs`. macOS Launch Services will not
// deliver `cinetrack://` to a `tauri dev` binary (no `.app` bundle), so
// desktop OAuth returns through this loopback URL instead.
export const DESKTOP_OAUTH_LOOPBACK_URL = "http://127.0.0.1:7420/auth/callback";

export function getAuthRedirectUrl(): string {
  if (isTauriApp()) {
    const configured = import.meta.env.VITE_AUTH_DESKTOP_REDIRECT_URL?.trim();

    if (configured) return configured;

    // Custom-scheme registration is unsupported at runtime on iOS too, but
    // the bundled Info.plist *does* own `cinetrack://` there. Desktop
    // `tauri dev` has no bundle, so it must use the loopback server.
    if (/iphone|ipad|ipod|android/i.test(navigator.userAgent)) {
      return "cinetrack://auth/callback";
    }

    return DESKTOP_OAUTH_LOOPBACK_URL;
  }

  const configuredRedirect = import.meta.env.VITE_AUTH_WEB_REDIRECT_URL?.trim();

  if (configuredRedirect) return configuredRedirect;
  if (typeof window !== "undefined") return `${window.location.origin}/`;

  return "http://localhost:1420/";
}
