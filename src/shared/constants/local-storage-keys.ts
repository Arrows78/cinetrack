/**
 * Centralized localStorage key registry. Every `cinetrack.*` key used by the
 * app is declared here once, preventing silent drift between the writer and
 * reader of the same slot.
 */

/** TMDB bearer token (browser-preview fallback path). */
export const BROWSER_TOKEN_KEY = "cinetrack.tmdb-token";

/** User-selected UI language. */
export const LANGUAGE_STORAGE_KEY = "cinetrack.language";

/** Supabase auth session (persisted by Supabase client). */
export const AUTH_SESSION_STORAGE_KEY = "cinetrack.auth.session";

/** Legacy react-query persister slot (no longer written, kept for cleanup). */
export const LEGACY_QUERY_CACHE_KEY = "cinetrack.query-cache.v1";
