import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  availabilityAlertSchema,
  availabilitySnapshotSchema,
  customListItemSchema,
  customListSchema,
  dismissedRecommendationSchema,
  episodeProgressSchema,
  libraryItemSchema,
  trackedSeriesItemSchema,
  userProfileSchema,
  viewingEventSchema,
  viewingHistoryItemSchema,
} from "../portable-data-schema";

// Zod objects strip every key they do not declare. A field added to a Rust DTO
// (and therefore exported) but not to its schema is silently erased by the
// next restore — that already happened to a viewing event's `note` and to a
// tracked series' `status`. This pins each exported DTO's keys to its schema.
function dtoKeys(name: string): string[] {
  const source = readFileSync(resolve(__dirname, `../../../generated/dto/${name}.ts`), "utf8");
  return [...source.matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]!).sort();
}

const cases: Array<[string, { shape: Record<string, unknown> }, string[]]> = [
  ["AvailabilityAlert", availabilityAlertSchema, []],
  ["AvailabilitySnapshot", availabilitySnapshotSchema, []],
  ["CustomList", customListSchema, []],
  ["CustomListItem", customListItemSchema, []],
  ["DismissedRecommendation", dismissedRecommendationSchema, []],
  ["EpisodeProgress", episodeProgressSchema, []],
  // `id` is never restored (import_impl generates a fresh uuid) and is
  // deliberately absent from the schema; Rust defaults it when missing.
  ["LibraryItem", libraryItemSchema, ["id"]],
  ["TrackedSeriesItem", trackedSeriesItemSchema, []],
  ["UserProfile", userProfileSchema, []],
  ["ViewingEvent", viewingEventSchema, []],
  ["ViewingHistoryItem", viewingHistoryItemSchema, []],
];

describe("portable data schemas keep every exported DTO field", () => {
  it.each(cases)("%s", (name, schema, intentionallyMissing) => {
    const expected = dtoKeys(name).filter((key) => !intentionallyMissing.includes(key));
    expect(Object.keys(schema.shape).sort()).toEqual(expect.arrayContaining(expected));
  });
});
