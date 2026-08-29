import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { profileCommands } from "@/features/profiles/profile-commands";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { UserProfile } from "@/types/media";

// The default-profile seed, supabase auto-claim logic and cascading delete
// now live in Rust (see src-tauri/src/profiles/) — this
// repository is a thin invoke() wrapper.
export const profileRepository = {
  async list(): Promise<UserProfile[]> {
    return invokeTypedCommand(profileCommands.list);
  },

  async create(name: string, avatar?: string | null, supabaseUserId?: string | null): Promise<UserProfile> {
    return invokeTypedCommand(profileCommands.create, {
      name,
      avatar: avatar ?? null,
      supabaseUserId: supabaseUserId ?? null,
    });
  },

  // Every profile going forward must belong to whoever is signed in with
  // Supabase — this is the only creation path the UI should call.
  async createForSupabaseUser(name: string, supabaseUserId: string, avatar?: string | null): Promise<UserProfile> {
    return this.create(name, avatar, supabaseUserId);
  },

  async findBySupabaseUserId(supabaseUserId: string): Promise<UserProfile | null> {
    return invokeTypedCommand(profileCommands.findBySupabaseUserId, { supabaseUserId });
  },

  async linkToSupabaseUser(profileId: string, supabaseUserId: string): Promise<UserProfile> {
    return invokeTypedCommand(profileCommands.linkToSupabaseUser, { profileId, supabaseUserId });
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
    return invokeTypedCommand(profileCommands.resolveForSupabaseUser, { supabaseUserId });
  },

  async remove(profileId: string): Promise<void> {
    await invokeTypedCommand(profileCommands.remove, { profileId });

    const preferences = await preferencesRepository.getPreferences();
    if (preferences.activeProfileId === profileId) {
      await preferencesRepository.setActiveProfile(DEFAULT_PROFILE_ID);
    }
  },
};
