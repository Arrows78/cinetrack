import type { SupabaseClient } from "@supabase/supabase-js";

import { isTauriApp } from "@/shared/lib/platform";

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
let authClientPromise: Promise<SupabaseClient | null> | null = null;

export function getAuthRedirectUrl(): string {
  if (isTauriApp()) {
    return import.meta.env.VITE_AUTH_DESKTOP_REDIRECT_URL?.trim() || "cinetrack://auth/callback";
  }

  const configuredRedirect = import.meta.env.VITE_AUTH_WEB_REDIRECT_URL?.trim();

  if (configuredRedirect) return configuredRedirect;
  if (typeof window !== "undefined") return `${window.location.origin}/`;

  return "http://localhost:1420/";
}

// persistSession defaults Supabase's storage to plain window.localStorage —
// unencrypted, unlike the TMDB bearer token in token-vault.ts, which sits
// behind a Stronghold vault requiring a password. Evaluated moving this
// session behind Stronghold too and deliberately didn't: autoRefreshToken
// needs to read it silently on every launch to restore the signed-in state,
// and Stronghold requires an unlocked, password-derived vault — putting the
// session behind it means either a password prompt on every launch (a much
// worse UX than the risk it defends against) or a second secret (an
// auto-unlock key in the OS keychain) to bootstrap Stronghold silently,
// which is a real feature in its own right, not a mechanical move. Given
// this app's CSP (script-src 'self', no eval, no third-party JS) already
// closes off the common classic-XSS path that this would defend against,
// the risk doesn't currently justify that cost. Revisit if the CSP ever
// loosens or this app starts rendering untrusted HTML/scripts.
// Dynamically imported: @supabase/supabase-js is a ~200KB dependency that a
// build with auth unconfigured or optional-and-unused should never have to
// fetch at all. The promise is cached so concurrent/repeated calls share one
// in-flight import instead of re-triggering it.
export function getAuthClient(): Promise<SupabaseClient | null> {
  if (!authConfig.configured || !supabaseUrl || !supabasePublishableKey) {
    return Promise.resolve(null);
  }

  authClientPromise ??= import("@supabase/supabase-js").then(({ createClient }) => {
    authClient ??= createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
        storageKey: "cinetrack.auth.session",
      },
    });

    return authClient;
  });

  return authClientPromise;
}
