import type { Migration } from "./types";

// Denormalizes the show's own TMDB production status (e.g. "Returning
// Series", "Ended", "Canceled") alongside total_episodes, the same way
// title/poster_path already are — lets the library grid tell "caught up,
// more episodes coming" apart from "the show itself is actually over"
// without an extra TMDB fetch per card. Null for rows written before
// this column existed, and for TV Time imports (no TMDB status in a
// GDPR export) — both read as "unknown", never as "ended".
export const migration: Migration = {
  version: 11,
  name: "add status to tracked_series",
  statements: ["ALTER TABLE tracked_series ADD COLUMN status TEXT"],
};
