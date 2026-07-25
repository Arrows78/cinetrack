import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SocialAuthProvider = "apple" | "facebook" | "google" | "twitter";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const authConfig = {
  configured: Boolean(supabaseUrl && supabasePublishableKey),
  required: import.meta.env.VITE_AUTH_REQUIRED === "true",
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

  return import.meta.env.VITE_AUTH_WEB_REDIRECT_URL?.trim() || `${window.location.origin}/`;
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
    },
  });

  return authClient;
}
