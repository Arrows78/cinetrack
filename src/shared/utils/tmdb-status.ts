import type { TFunction } from "i18next";

// TMDB's `status` strings (TV and movie) mapped to their translation key. They
// are English by construction: shown as they come, a French interface would
// read "Returning Series" in the middle of a French sheet.
const STATUS_KEYS: Record<string, string> = {
  "Returning Series": "returningSeries",
  Ended: "ended",
  Canceled: "canceled",
  "In Production": "inProduction",
  Planned: "planned",
  Pilot: "pilot",
  Released: "released",
  "Post Production": "postProduction",
  Rumored: "rumored",
};

/** The status in the interface language; a value TMDB adds later is shown as sent rather than hidden. */
export function tmdbStatusLabel(status: string, t: TFunction): string {
  const key = STATUS_KEYS[status];
  return key ? t(`media.tmdbStatus.${key}`) : status;
}
