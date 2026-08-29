import m001 from "../../../src-tauri/src/database/migrations/001-initial-schema.sql?raw";
import m009 from "../../../src-tauri/src/database/migrations/009-availability-alerts-unique.sql?raw";
import m010 from "../../../src-tauri/src/database/migrations/010-merge-watchlist-into-library.sql?raw";
import m011 from "../../../src-tauri/src/database/migrations/011-add-status-to-tracked-series.sql?raw";
import m012 from "../../../src-tauri/src/database/migrations/012-remove-rewatching-status.sql?raw";
import m013 from "../../../src-tauri/src/database/migrations/013-add-note-to-viewing-events.sql?raw";
import m014 from "../../../src-tauri/src/database/migrations/014-add-smart-lists.sql?raw";
import m015 from "../../../src-tauri/src/database/migrations/015-add-saved-filters.sql?raw";
import m016 from "../../../src-tauri/src/database/migrations/016-index-large-library-stats.sql?raw";
import type { Migration } from "./types";

const statementMarker = "-- cinetrack:statement";

export function parseCanonicalMigration(source: string): Migration {
  const header = source.split(statementMarker, 1)[0] ?? "";
  const versionValue = header
    .split("\n")
    .find((line) => line.startsWith("-- cinetrack:version "))
    ?.slice("-- cinetrack:version ".length);
  const name = header
    .split("\n")
    .find((line) => line.startsWith("-- cinetrack:name "))
    ?.slice("-- cinetrack:name ".length);

  const version = Number(versionValue);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error("Canonical migration has an invalid or missing version header");
  }
  if (!name) {
    throw new Error(`Canonical migration ${version} has no name header`);
  }

  const statements = source
    .split(statementMarker)
    .slice(1)
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0) {
    throw new Error(`Canonical migration ${version} (${name}) has no statements`);
  }

  return { version, name, statements };
}

export function extractCanonicalMigrations(sources: readonly string[]): readonly Migration[] {
  const parsed = sources.map(parseCanonicalMigration);
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index]!.version <= parsed[index - 1]!.version) {
      throw new Error("Canonical migration versions must be strictly increasing");
    }
  }
  return parsed;
}

export const migrations = extractCanonicalMigrations([m001, m009, m010, m011, m012, m013, m014, m015, m016]);
