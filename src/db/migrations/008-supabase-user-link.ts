import type { Migration } from "./types";

// Links a local profile to the Supabase account that must be signed in to
// access it. Nullable because 'default' (and any profile created before
// this migration) predates Supabase auth entirely — profileRepository
// resolves that by auto-claiming the first unclaimed profile for whichever
// account signs in first, rather than leaving pre-existing data orphaned.
// A plain ADD COLUMN + separate index is enough here (no table rebuild):
// unlike migration 007's FOREIGN KEY, a nullable column with a unique index
// has no ALTER TABLE limitation to work around, and there is no foreign key
// to declare in the first place — `auth.users` lives in Supabase's own
// Postgres database, entirely outside this SQLite file.
export const migration: Migration = {
  version: 8,
  name: "link profiles to a supabase user",
  statements: [
    "ALTER TABLE profiles ADD COLUMN supabase_user_id TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_supabase_user ON profiles(supabase_user_id)",
  ],
};
