/**
 * Named staleTime durations for TanStack Query. Raw millisecond arithmetic
 * is hard to scan; these constants make the intent obvious and keep every
 * consumer in sync when the value needs to change.
 */
export const STALE_5_MIN = 1000 * 60 * 5;
export const STALE_30_MIN = 1000 * 60 * 30;
export const STALE_1_HOUR = 1000 * 60 * 60;
export const STALE_6_HOURS = 1000 * 60 * 60 * 6;
export const STALE_24_HOURS = 1000 * 60 * 60 * 24;

/**
 * Shared debounce delay for search inputs. Balances responsiveness (feels
 * snappy) against API call reduction (avoids firing on every keystroke).
 * Command palette and search pages all use this same value for consistency.
 */
export const DEBOUNCE_MS = 300;

/**
 * Garbage collection time for TanStack Query — how long unused data stays
 * in memory before being evicted. Set to 7 days to cover a full week of
 * app restarts without re-fetching, while still eventually cleaning up.
 */
export const GC_7_DAYS = 1000 * 60 * 60 * 24 * 7;

/**
 * Confetti animation delays — staggered to feel natural after a seen-toggle
 * or season-completion action.
 */
export const CONFETTI_DELAY_MS = 300;
export const CONFETTI_SEASON_COMPLETE_DELAY_MS = 400;

/**
 * Minimum search query length before a search is triggered. Prevents firing
 * API requests for single-character inputs that would return too many
 * irrelevant results anyway.
 */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Delay before a tooltip appears on hover (ms). */
export const TOOLTIP_DELAY_MS = 300;
