import { normalizeTitle } from "@/shared/utils/text";
import type { LibraryItem } from "@/types/media";

const DAY_MS = 24 * 60 * 60 * 1000;

// A "planned" library item counts as stale once it's sat untouched this
// long — long enough that "still meaning to get to it" has likely become
// "forgotten," short enough to still be a useful nudge rather than noise.
// Shared with the Today Hub's "needs attention" card (see
// components/media/home/needs-attention-section.tsx) so both surfaces agree
// on what "forgotten" means.
export const STALE_PLANNED_DAYS = 30;

// Two same-titled library items count as "probably the same title" once
// their year is within this many years of each other (a missing year on
// either side matches anything — there's no signal to rule it out with) —
// wide enough to absorb a regional release-date mismatch between metadata
// sources, narrow enough that a decades-later reboot sharing a title isn't
// flagged as a duplicate of the original.
const DUPLICATE_YEAR_TOLERANCE = 1;

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

/** Exported for isolated unit testing — items with no poster or no genre data, usually a botched or orphaned TMDB match. */
export function selectMissingMetadataItems(libraryItems: LibraryItem[]): LibraryItem[] {
  return libraryItems.filter((item) => !item.posterPath || item.genres.length === 0);
}

export interface DuplicateGroup {
  key: string;
  items: LibraryItem[];
}

/**
 * Groups library items that are probably the same title added twice under
 * different TMDB ids — the DB's (profile_id, media_id, media_type) unique
 * constraint only blocks an *exact* re-add, never e.g. a TV Time import
 * resolving to a different id than one already added by hand. Within each
 * same-mediaType-and-normalized-title bucket, items are further split into
 * disjoint year-proximity clusters (seeded by the first remaining item each
 * pass) so, say, two "A Star Is Born" duplicate pairs from different decades
 * don't get merged into one group or have one pair silently dropped.
 * Exported for isolated unit testing.
 */
export function selectProbableDuplicates(libraryItems: LibraryItem[]): DuplicateGroup[] {
  const byTitle = new Map<string, LibraryItem[]>();
  for (const item of libraryItems) {
    const key = `${item.mediaType}:${normalizeTitle(item.title)}`;
    const group = byTitle.get(key) ?? [];
    group.push(item);
    byTitle.set(key, group);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, items] of byTitle) {
    if (items.length < 2) continue;

    let remaining = items;
    let clusterIndex = 0;
    while (remaining.length > 0) {
      const seed = remaining[0]!;
      const cluster = remaining.filter(
        (item) =>
          item === seed ||
          item.year == null ||
          seed.year == null ||
          Math.abs(item.year - seed.year) <= DUPLICATE_YEAR_TOLERANCE
      );
      if (cluster.length >= 2) groups.push({ key: `${key}#${clusterIndex}`, items: cluster });
      remaining = remaining.filter((item) => !cluster.includes(item));
      clusterIndex += 1;
    }
  }

  return groups;
}
