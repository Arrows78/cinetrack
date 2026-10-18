import { profileCommands } from "@/features/profiles/profile-commands";
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

  async linkToSupabaseUser(
    profileId: string,
    supabaseUserId: string,
    currentPin?: string | null
  ): Promise<UserProfile> {
    return invokeTypedCommand(profileCommands.linkToSupabaseUser, {
      profileId,
      supabaseUserId,
      currentPin: currentPin ?? null,
    });
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

  async update(
    profileId: string,
    name: string,
    avatar?: string | null,
    currentPin?: string | null
  ): Promise<UserProfile> {
    return invokeTypedCommand(profileCommands.update, {
      profileId,
      name,
      avatar: avatar ?? null,
      currentPin: currentPin ?? null,
    });
  },

  async setPin(profileId: string, pin: string, currentPin?: string | null): Promise<UserProfile> {
    return invokeTypedCommand(profileCommands.setPin, { profileId, pin, currentPin: currentPin ?? null });
  },

  async clearPin(profileId: string, currentPin?: string | null): Promise<UserProfile> {
    return invokeTypedCommand(profileCommands.clearPin, { profileId, currentPin: currentPin ?? null });
  },

  async verifyPin(profileId: string, pin: string): Promise<boolean> {
    return invokeTypedCommand(profileCommands.verifyPin, { profileId, pin });
  },

  // Removing the active profile resets `activeProfileId` to the default one
  // inside the same Rust transaction (and drops the preferences cache), so
  // nothing is left to do here.
  async remove(profileId: string, currentPin?: string | null): Promise<void> {
    await invokeTypedCommand(profileCommands.remove, { profileId, currentPin: currentPin ?? null });
  },
};
