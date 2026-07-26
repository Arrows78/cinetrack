/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_TOKEN?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_AUTH_REQUIRED?: "true" | "false";
  readonly VITE_AUTH_DESKTOP_REDIRECT_URL?: string;
  readonly VITE_AUTH_WEB_REDIRECT_URL?: string;
  readonly VITE_AUTH_OTP_LENGTH?: string;
  readonly VITE_AUTH_OTP_RESEND_SECONDS?: string;
  readonly VITE_TERMS_URL?: string;
  readonly VITE_PRIVACY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
