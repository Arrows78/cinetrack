import { trackingService } from "@/features/tracking/tracking-service";
import type { TrackingEntry } from "@/types/media";

// How many days ahead "this week" covers — passed straight through to
// trackingService.build(days), which forwards it to calendarService.build()
// (see calendar-service.ts's default of 60 for the full Tracking page).
const WEEKLY_AGENDA_DAYS = 7;

/**
 * Narrows a tracking feed down to what belongs on a "this week" agenda:
 *
 * - Only "mine" entries (see isCalendarEntryMine in tracking-service.ts) —
 *   a movie release the user never added to their library is TMDB's global
 *   upcoming feed, not something personal to surface on a weekly agenda.
 *   Episode entries are always "mine" already (they only exist because
 *   their series is tracked).
 * - A dated entry (release/episode) is kept as-is — trackingService.build()
 *   already scoped those to the requested day window via
 *   calendarService.build().
 * - An availability entry is only kept once it's actually `available`: a
 *   still-pending alert has no fixed date and would otherwise sit on every
 *   week's agenda forever, so only the state change (a title just became
 *   available) is agenda-worthy.
 *
 * Exported separately from `build()` below so the filtering rules can be
 * unit-tested without mocking the tracking/calendar/availability fetch
 * chain those pull in.
 */
export function selectWeeklyAgendaEntries(entries: TrackingEntry[]): TrackingEntry[] {
  return entries.filter(
    (entry) => entry.scope === "mine" && (entry.type !== "availability" || entry.available === true)
  );
}

export const weeklyAgendaService = {
  async build(): Promise<TrackingEntry[]> {
    const entries = await trackingService.build(WEEKLY_AGENDA_DAYS);
    return selectWeeklyAgendaEntries(entries);
  },
};
