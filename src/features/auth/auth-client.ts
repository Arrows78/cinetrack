import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SocialAuthProvider = "apple" | "facebook" | "google" | "x";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function readInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(maximum, Math.max(minimum, parsed));
}

export const authConfig = {
  configured: Boolean(supabaseUrl && supabasePublishableKey),
  required: import.meta.env.VITE_AUTH_REQUIRED === "true",
  otpLength: readInteger(import.meta.env.VITE_AUTH_OTP_LENGTH, 6, 6, 10),
  otpResendSeconds: readInteger(import.meta.env.VITE_AUTH_OTP_RESEND_SECONDS, 60, 30, 300),
  termsUrl: import.meta.env.VITE_TERMS_URL?.trim() || undefined,
  privacyUrl: import.meta.env.VITE_PRIVACY_URL?.trim() || undefined,
};

let authClient: SupabaseClient | null = null;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getAuthRedirectUrl(): string {
  if (isTauriRuntime()) {
    return import.meta.env.VITE_AUTH_DESKTOP_REDIRECT_URL?.trim() || "cinetrack://auth/callback";
  }

  const configuredRedirect = import.meta.env.VITE_AUTH_WEB_REDIRECT_URL?.trim();

  if (configuredRedirect) return configuredRedirect;
  if (typeof window !== "undefined") return `${window.location.origin}/`;

  return "http://localhost:1420/";
}

export function getAuthClient(): SupabaseClient | null {
  if (!authConfig.configured || !supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  authClient ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: !isTauriRuntime(),
      flowType: "pkce",
      persistSession: true,
      storageKey: "cinetrack.auth.session",
    },
  });

  return authClient;
}
