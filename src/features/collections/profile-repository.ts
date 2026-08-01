import { getDatabase } from "@/db/client";
import { newUuid } from "@/shared/lib/id";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import type { UserProfile } from "@/types/media";

const nowIso = () => new Date().toISOString();

const rowToProfile = (row: Record<string, unknown>): UserProfile => ({
  id: String(row.uuid),
  name: String(row.name),
  avatar: row.avatar ? String(row.avatar) : null,
  createdAt: String(row.created_at),
  supabaseUserId: row.supabase_user_id ? String(row.supabase_user_id) : null,
});

export const profileRepository = {
  async list(): Promise<UserProfile[]> {
    const db = await getDatabase();
    const now = nowIso();
    await db.execute(
      "INSERT OR IGNORE INTO profiles (uuid, name, avatar, created_at, updated_at) VALUES ('default', 'Principal', NULL, $1, $1)",
      [now]
    );
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM profiles ORDER BY CASE WHEN uuid = 'default' THEN 0 ELSE 1 END, created_at ASC"
    );
    return rows.map(rowToProfile);
  },

  async create(name: string, avatar?: string | null, supabaseUserId?: string | null): Promise<UserProfile> {
    const now = nowIso();
    const profile: UserProfile = {
      id: newUuid(),
      name: name.trim() || "Profil",
      avatar,
      createdAt: now,
      supabaseUserId: supabaseUserId ?? null,
    };
    const db = await getDatabase();
    await db.execute(
      "INSERT INTO profiles (uuid, name, avatar, created_at, updated_at, supabase_user_id) VALUES ($1, $2, $3, $4, $4, $5)",
      [profile.id, profile.name, profile.avatar ?? null, profile.createdAt, profile.supabaseUserId ?? null]
    );
    return profile;
  },

  // Every profile going forward must belong to whoever is signed in with
  // Supabase — this is the only creation path the UI should call.
  async createForSupabaseUser(name: string, supabaseUserId: string, avatar?: string | null): Promise<UserProfile> {
    return this.create(name, avatar, supabaseUserId);
  },

  async findBySupabaseUserId(supabaseUserId: string): Promise<UserProfile | null> {
    const db = await getDatabase();
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM profiles WHERE supabase_user_id = $1 LIMIT 1",
      [supabaseUserId]
    );
    return rows[0] ? rowToProfile(rows[0]) : null;
  },

  async linkToSupabaseUser(profileId: string, supabaseUserId: string): Promise<UserProfile> {
    const db = await getDatabase();
    await db.execute("UPDATE profiles SET supabase_user_id = $1, updated_at = $2 WHERE uuid = $3", [
      supabaseUserId,
      nowIso(),
      profileId,
    ]);
    const rows = await db.select<Array<Record<string, unknown>>>("SELECT * FROM profiles WHERE uuid = $1", [profileId]);
    if (!rows[0]) throw new Error("Profil introuvable.");
    return rowToProfile(rows[0]);
  },

  /**
   * Resolves which local profile a signed-in Supabase account should land
   * on: the profile it's already linked to, or — only the very first time,
   * for whichever account signs in first — the 'default' profile that
   * predates Supabase auth entirely, auto-claimed so pre-existing local
   * data isn't orphaned by this feature. Returns null when neither applies,
   * meaning the caller must offer to create a brand new profile.
   */
  async resolveForSupabaseUser(supabaseUserId: string): Promise<UserProfile | null> {
    const existing = await this.findBySupabaseUserId(supabaseUserId);
    if (existing) return existing;

    const profiles = await this.list();
    const defaultProfile = profiles.find((profile) => profile.id === "default");
    if (defaultProfile && !defaultProfile.supabaseUserId) {
      return this.linkToSupabaseUser("default", supabaseUserId);
    }

    return null;
  },

  async remove(profileId: string): Promise<void> {
    if (profileId === "default") throw new Error("Le profil principal ne peut pas être supprimé.");
    const preferences = await preferencesRepository.getPreferences();
    const db = await getDatabase();
    await db.execute("BEGIN IMMEDIATE");
    try {
      const listRows = await db.select<Array<{ uuid: string }>>("SELECT uuid FROM custom_lists WHERE profile_id = $1", [
        profileId,
      ]);
      for (const row of listRows) await db.execute("DELETE FROM custom_list_items WHERE list_id = $1", [row.uuid]);
      await db.execute("DELETE FROM custom_lists WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM watchlist_items WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM seen_movies WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM episode_progress WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM tracked_series WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM library_items WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM viewing_events WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM availability_alerts WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM activity_log WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM profiles WHERE uuid = $1", [profileId]);
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
    if (preferences.activeProfileId === profileId) {
      await preferencesRepository.updatePreference("activeProfileId", "default");
    }
  },
};
