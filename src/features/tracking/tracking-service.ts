import { calendarService } from "@/features/calendar";
import { availabilityRepository } from "@/features/availability/availability-repository";
import { libraryRepository } from "@/features/library/library-repository";
import type { CalendarEntry, TrackingEntry } from "@/types/media";

// A movie-release entry is only "mine" once the user actually tracks that
// title (it's in their library) — otherwise it's just TMDB's global
// upcoming-releases feed. An episode entry is always "mine": it only
// exists because its series is in tracked_series, which is itself an
// opt-in. This is the one filter that decides what's allowed to notify
// (see buildNotifiableCalendarEntries) as well as what the tracking page
// shows by default.
function isCalendarEntryMine(entry: CalendarEntry, libraryMediaIds: ReadonlySet<number>): boolean {
  return entry.kind === "episode" || libraryMediaIds.has(entry.mediaId);
}

function fromCalendarEntry(entry: CalendarEntry, libraryMediaIds: ReadonlySet<number>): TrackingEntry {
  return {
    id: entry.id,
    mediaId: entry.mediaId,
    mediaType: entry.mediaType,
    title: entry.title,
    type: entry.kind === "episode" ? "episode" : "release",
    scope: isCalendarEntryMine(entry, libraryMediaIds) ? "mine" : "discovery",
    date: entry.date,
    posterPath: entry.posterPath,
    seasonNumber: entry.seasonNumber,
    episodeNumber: entry.episodeNumber,
    episodeTitle: entry.episodeTitle,
  };
}

export const trackingService = {
  // The unified feed behind the Suivi page: release dates, episode air
  // dates, and availability-alert status, each tagged with a type and a
  // scope so the page can filter without needing three separate queries.
  async build(days = 60): Promise<TrackingEntry[]> {
    const [calendarEntries, libraryKeys, alerts] = await Promise.all([
      calendarService.build(days),
      libraryRepository.listMediaKeys(),
      availabilityRepository.listAlerts(),
    ]);

    const libraryMediaIds = new Set(libraryKeys.map((key) => key.mediaId));
    const releaseEntries = calendarEntries.map((entry) => fromCalendarEntry(entry, libraryMediaIds));

    const availabilityEntries = await Promise.all(
      alerts
        .filter((alert) => alert.enabled)
        .map(async (alert): Promise<TrackingEntry> => {
          const snapshot = await availabilityRepository.getSnapshot(alert.mediaId, alert.mediaType, alert.region);
          const currentProviderIds = snapshot?.providerIds ?? [];
          const matchedProviderIds = alert.providerIds.length
            ? currentProviderIds.filter((id) => alert.providerIds.includes(id))
            : currentProviderIds;
          return {
            id: `availability-${alert.id}`,
            mediaId: alert.mediaId,
            mediaType: alert.mediaType,
            title: alert.title,
            type: "availability",
            scope: "mine",
            date: null,
            available: matchedProviderIds.length > 0,
            providerIds: matchedProviderIds,
            region: alert.region,
            alertId: alert.id,
          };
        })
    );

    return [...releaseEntries, ...availabilityEntries];
  },

  // What App.tsx's background notification check feeds into
  // notificationService.notifyDue. Filtered to "mine" so a title nobody
  // added to their library can never trigger a push notification just
  // because it happens to be releasing soon somewhere in TMDB's catalogue.
  async buildNotifiableCalendarEntries(days = 60): Promise<CalendarEntry[]> {
    const [entries, libraryKeys] = await Promise.all([calendarService.build(days), libraryRepository.listMediaKeys()]);
    const libraryMediaIds = new Set(libraryKeys.map((key) => key.mediaId));
    return entries.filter((entry) => isCalendarEntryMine(entry, libraryMediaIds));
  },
};
