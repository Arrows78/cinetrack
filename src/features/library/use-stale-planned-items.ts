import { useQuery } from "@tanstack/react-query";
import { libraryRepository } from "@/features/library/library-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
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

/**
 * The instant a planned item must have been last updated at or before to be
 * stale: exactly `STALE_PLANNED_DAYS` whole days before `now`. Sent to Rust,
 * which does the filtering and ordering in SQL (`list_stale_planned_library_items`)
 * instead of this page reading the whole library.
 */
export function staleCutoff(now: Date): Date {
  return new Date(now.getTime() - STALE_PLANNED_DAYS * DAY_MS);
}

/** Exported for isolated unit testing — attaches the whole-days age to items Rust already selected as stale. */
export function toStaleItems(items: LibraryItem[], now: Date): StaleLibraryItem[] {
  return items.map((item) => ({
    item,
    daysSinceUpdate: Math.floor((now.getTime() - new Date(item.updatedAt).getTime()) / DAY_MS),
  }));
}

/** The first `limit` planned items untouched for `STALE_PLANNED_DAYS`, newest first. */
export function useStalePlannedItems(limit: number) {
  const profileId = useActiveProfileId();
  return useQuery({
    // Nested under the library key: every library mutation already
    // invalidates this prefix.
    queryKey: [...queryKeys.local.library(profileId), "stalePlanned", limit],
    queryFn: async () => {
      const now = new Date();
      const items = await libraryRepository.stalePlanned(staleCutoff(now).toISOString(), limit);
      return toStaleItems(items, now);
    },
  });
}
