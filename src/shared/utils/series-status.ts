// TMDB's TV "status" field — "Ended"/"Canceled" mean no more episodes will
// ever air; every other value ("Returning Series", "In Production",
// "Planned", "Pilot") means more could still come.
const ENDED_STATUSES = new Set(["Ended", "Canceled"]);

/** null/undefined (unknown — a row from before this was tracked, or a TV Time import) is never treated as ended. */
export function isSeriesEnded(status: string | null | undefined): boolean {
  return status ? ENDED_STATUSES.has(status) : false;
}

export type ProgressBarTone = "inProgress" | "caughtUp" | "finished";

/**
 * The three states a progress bar can be in, shared between MediaCard and
 * MediaListRow: still catching up (primary), caught up with everything
 * aired so far but the show itself could still return (warning), or
 * genuinely over (success) — see docs/design-system.md's token list for why
 * these three and not new colors.
 */
export function progressBarTone(watched: number, total: number, seriesStatus?: string | null): ProgressBarTone {
  if (watched < total) return "inProgress";
  return isSeriesEnded(seriesStatus) ? "finished" : "caughtUp";
}
