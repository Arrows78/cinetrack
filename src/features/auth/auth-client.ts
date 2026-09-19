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
// `src-tauri/src/auth/oauth_callback.rs`. Used only by `pnpm tauri dev`:
// a bundled `.app` owns `cinetrack://` via Info.plist / Launch Services.
export const DESKTOP_OAUTH_LOOPBACK_URL = "http://127.0.0.1:7420/auth/callback";
export const DESKTOP_OAUTH_SCHEME_URL = "cinetrack://auth/callback";

export function getAuthRedirectUrl(): string {
  if (isTauriApp()) {
    if (/iphone|ipad|ipod|android/i.test(navigator.userAgent)) {
      return import.meta.env.VITE_AUTH_DESKTOP_REDIRECT_URL?.trim() || DESKTOP_OAUTH_SCHEME_URL;
    }

    // Vite `tauri dev` / `vitest` are not `production`. A bundled
    // `tauri build` is, and that `.app` owns `cinetrack://`.
    if (import.meta.env.MODE !== "production") {
      return DESKTOP_OAUTH_LOOPBACK_URL;
    }

    return import.meta.env.VITE_AUTH_DESKTOP_REDIRECT_URL?.trim() || DESKTOP_OAUTH_SCHEME_URL;
  }

  const configuredRedirect = import.meta.env.VITE_AUTH_WEB_REDIRECT_URL?.trim();

  if (configuredRedirect) return configuredRedirect;
  if (typeof window !== "undefined") return `${window.location.origin}/`;

  return "http://localhost:1420/";
}
