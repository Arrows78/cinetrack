import { defineCommand } from "@/shared/lib/invoke";
import type { UserPreferences } from "@/types/media";

type PreferenceKey = Exclude<keyof UserPreferences, "activeProfileId">;

type UpdatePreferenceArgs = {
  key: PreferenceKey;
  value: UserPreferences[PreferenceKey];
};

type SetActiveProfileArgs = {
  profileId: string;
  supabaseUserId: string | null;
};

export const preferencesCommands = {
  get: defineCommand<undefined, UserPreferences>("get_preferences"),
  update: defineCommand<UpdatePreferenceArgs, UserPreferences>("update_preference"),
  setActiveProfile: defineCommand<SetActiveProfileArgs, UserPreferences>("set_active_profile"),
  refresh: defineCommand<undefined, void>("refresh_preferences"),
} as const;
