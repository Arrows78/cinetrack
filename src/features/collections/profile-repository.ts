import { browserStore, getDatabase } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import type { UserProfile } from "@/types/media";

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const rowToProfile = (row: Record<string, unknown>): UserProfile => ({
  id: String(row.id),
  name: String(row.name),
  avatar: row.avatar ? String(row.avatar) : null,
  createdAt: String(row.created_at),
  supabaseUserId: row.supabase_user_id ? String(row.supabase_user_id) : null,
});

export const profileRepository = {
  async list(): Promise<UserProfile[]> {
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      if (!store.profiles.some((profile) => profile.id === "default")) {
        store.profiles = [{ id: "default", name: "Principal", createdAt: nowIso() }, ...store.profiles];
        browserStore.write(store);
      }
      return [...store.profiles];
    }
    await db.execute(
      "INSERT OR IGNORE INTO profiles (id, name, avatar, created_at) VALUES ('default', 'Principal', NULL, $1)",
      [nowIso()]
    );
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM profiles ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, created_at ASC"
    );
    return rows.map(rowToProfile);
  },

  async create(name: string, avatar?: string | null, supabaseUserId?: string | null): Promise<UserProfile> {
    const profile: UserProfile = {
      id: uid(),
      name: name.trim() || "Profil",
      avatar,
      createdAt: nowIso(),
      supabaseUserId: supabaseUserId ?? null,
    };
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      store.profiles.push(profile);
      browserStore.write(store);
      return profile;
    }
    await db.execute(
      "INSERT INTO profiles (id, name, avatar, created_at, supabase_user_id) VALUES ($1, $2, $3, $4, $5)",
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
    if (!db) return browserStore.read().profiles.find((profile) => profile.supabaseUserId === supabaseUserId) ?? null;
    const rows = await db.select<Array<Record<string, unknown>>>(
      "SELECT * FROM profiles WHERE supabase_user_id = $1 LIMIT 1",
      [supabaseUserId]
    );
    return rows[0] ? rowToProfile(rows[0]) : null;
  },

  async linkToSupabaseUser(profileId: string, supabaseUserId: string): Promise<UserProfile> {
    const db = await getDatabase();
    if (!db) {
      const store = browserStore.read();
      const profile = store.profiles.find((entry) => entry.id === profileId);
      if (!profile) throw new Error("Profil introuvable.");
      profile.supabaseUserId = supabaseUserId;
      browserStore.write(store);
      return profile;
    }
    await db.execute("UPDATE profiles SET supabase_user_id = $1 WHERE id = $2", [supabaseUserId, profileId]);
    const rows = await db.select<Array<Record<string, unknown>>>("SELECT * FROM profiles WHERE id = $1", [profileId]);
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
    if (!db) {
      const store = browserStore.read();
      const removedListIds = new Set(
        store.customLists.filter((list) => list.profileId === profileId).map((list) => list.id)
      );
      store.profiles = store.profiles.filter((profile) => profile.id !== profileId);
      store.watchlist = store.watchlist.filter((item) => (item.profileId ?? "default") !== profileId);
      store.seenMovies = store.seenMovies.filter((item) => (item.profileId ?? "default") !== profileId);
      store.episodeProgress = store.episodeProgress.filter((item) => (item.profileId ?? "default") !== profileId);
      store.trackedSeries = store.trackedSeries.filter((item) => (item.profileId ?? "default") !== profileId);
      store.library = store.library.filter((item) => item.profileId !== profileId);
      store.viewingEvents = store.viewingEvents.filter((item) => item.profileId !== profileId);
      store.customLists = store.customLists.filter((list) => list.profileId !== profileId);
      store.customListItems = store.customListItems.filter((item) => !removedListIds.has(item.listId));
      store.availabilityAlerts = store.availabilityAlerts.filter((item) => item.profileId !== profileId);
      store.history = store.history.filter((item) => item.metadata?.profileId !== profileId);
      browserStore.write(store);
      if (preferences.activeProfileId === profileId) {
        await preferencesRepository.updatePreference("activeProfileId", "default");
      }
      return;
    }
    await db.execute("BEGIN IMMEDIATE");
    try {
      const listRows = await db.select<Array<{ id: string }>>("SELECT id FROM custom_lists WHERE profile_id = $1", [
        profileId,
      ]);
      for (const row of listRows) await db.execute("DELETE FROM custom_list_items WHERE list_id = $1", [row.id]);
      await db.execute("DELETE FROM custom_lists WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM profile_watchlist WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM profile_seen_movies WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM profile_episode_progress WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM profile_tracked_series WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM library_items WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM viewing_events WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM availability_alerts WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM activity_log WHERE profile_id = $1", [profileId]);
      await db.execute("DELETE FROM profiles WHERE id = $1", [profileId]);
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
