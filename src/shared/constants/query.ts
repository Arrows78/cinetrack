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
