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

/** Last date (YYYY-MM-DD) the Home "On this day" invite banner was dismissed. */
export const ON_THIS_DAY_INVITE_DISMISSED_KEY = "cinetrack.on-this-day-invite-dismissed-at";

/** Clerk's client JWT, cached so the native session survives a restart. */
export const CLERK_CLIENT_JWT_STORAGE_KEY = "cinetrack.clerk.clientJwt";

/** TanStack Query's persisted remote-data cache (see app/query-client.ts). */
export const REMOTE_QUERY_CACHE_KEY = "cinetrack.remote-cache.v1";

/** Metadata (URL -> timestamp) of the images prefetched into the Cache API. */
export const IMAGE_CACHE_META_KEY = "cinetrack.image-cache.meta.v1";

/** ISO timestamp of the last successful automatic backup. */
export const LAST_AUTO_BACKUP_KEY = "cinetrack.last-auto-backup";

/** Flag set when the last automatic backup attempt failed. */
export const LAST_AUTO_BACKUP_FAILED_KEY = "cinetrack.last-auto-backup-failed";

/** Ids of the calendar reminders already delivered to one profile. */
export const sentNotificationsKey = (profileId: string) => `cinetrack.sent-notifications.v2:${profileId}`;

/** What one availability alert has already been told about. */
export const availabilityBaselineKey = (alertId: string) => `cinetrack.availability-baseline.v1:${alertId}`;
