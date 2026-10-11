import { preferencesCommands } from "@/features/preferences/preferences-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { UserPreferences } from "@/types/media";

// Re-exported for older call sites; new code imports them from
// preferences-schema.ts.
export { defaultPreferences, preferencesSchema } from "@/shared/constants/preferences-schema";

// Reading/writing/caching preferences now happens in Rust (see
// src-tauri/src/preferences/) — this repository is a thin
// invoke() wrapper.
export const preferencesRepository = {
  async getPreferences(): Promise<UserPreferences> {
    return invokeTypedCommand(preferencesCommands.get);
  },

  async updatePreference<Key extends Exclude<keyof UserPreferences, "activeProfileId">>(
    key: Key,
    value: UserPreferences[Key]
  ): Promise<UserPreferences> {
    return invokeTypedCommand(preferencesCommands.update, { key, value });
  },

  // The only legitimate way to switch activeProfileId — Rust rejects it via
  // the generic updatePreference above. See set_active_profile_impl's own
  // doc comment (src-tauri/src/preferences/) for what
  // supabaseUserId does and doesn't prove.
  async setActiveProfile(
    profileId: string,
    supabaseUserId?: string | null,
    pin?: string | null
  ): Promise<UserPreferences> {
    return invokeTypedCommand(preferencesCommands.setActiveProfile, {
      profileId,
      supabaseUserId: supabaseUserId ?? null,
      pin: pin ?? null,
    });
  },

  // Callers that write preferences storage directly (bulk backup restore)
  // must call this so the next getPreferences() re-reads instead of serving
  // a now-stale cached value.
  async refresh(): Promise<void> {
    await invokeTypedCommand(preferencesCommands.refresh);
  },
};
