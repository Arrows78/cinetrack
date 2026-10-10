import { logger } from "@/shared/lib/logger";

/**
 * The viewer's IANA time-zone identifier (`Europe/Paris`), or `null` when the
 * runtime cannot name it.
 *
 * The statistics bucket every watch by local day, month, year and hour, and a
 * single UTC offset (`Date.getTimezoneOffset()` of one instant) is wrong for
 * the part of the year on the other side of a daylight-saving change — so the
 * Rust side takes the real zone and applies the offset in force at each
 * event's own instant. A `null` leaves it with the fixed offset the caller
 * sends alongside.
 */
export function getViewerTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone.length > 0 ? zone : null;
  } catch (error) {
    // The fixed offset is the documented fallback (exact for the part of the
    // year it was read in), so this is logged, not surfaced.
    logger.warn(
      `Could not resolve the IANA time zone, statistics fall back to a fixed offset: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
