/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_TOKEN?: string;
  // Identity (Clerk). Postgres/Realtime — sync_*, community_*,
  // account_profiles — stays on Supabase, see VITE_SUPABASE_* below.
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  // Postgres/Realtime only now — see docs/auth.md's Clerk migration
  // section. Never a Supabase Auth session.
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_AUTH_REQUIRED?: "true" | "false";
  readonly VITE_AUTH_DESKTOP_REDIRECT_URL?: string;
  readonly VITE_AUTH_WEB_REDIRECT_URL?: string;
  readonly VITE_AUTH_OTP_RESEND_SECONDS?: string;
  readonly VITE_TERMS_URL?: string;
  readonly VITE_PRIVACY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
