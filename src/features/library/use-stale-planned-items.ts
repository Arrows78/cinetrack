import type { LibraryItem } from "@/types/media";

const DAY_MS = 24 * 60 * 60 * 1000;

// A "planned" library item counts as stale once it's sat untouched this
// long — long enough that "still meaning to get to it" has likely become
// "forgotten," short enough to still be a useful nudge rather than noise.
// Used by the Today Hub's "needs attention" card
// (components/media/home/needs-attention-section.tsx).
export const STALE_PLANNED_DAYS = 30;

export interface StaleLibraryItem {
  item: LibraryItem;
  daysSinceUpdate: number;
}

/** Exported for isolated unit testing — planned items with no activity in the last STALE_PLANNED_DAYS. */
export function selectStalePlannedItems(libraryItems: LibraryItem[], now: Date): StaleLibraryItem[] {
  return libraryItems
    .filter((item) => item.status === "planned")
    .map((item) => ({
      item,
      daysSinceUpdate: Math.floor((now.getTime() - new Date(item.updatedAt).getTime()) / DAY_MS),
    }))
    .filter(({ daysSinceUpdate }) => daysSinceUpdate >= STALE_PLANNED_DAYS);
}
