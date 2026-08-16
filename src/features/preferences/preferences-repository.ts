import { z } from "zod";
import { invokeCommand } from "@/shared/lib/invoke";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import type { UserPreferences } from "@/types/media";

export const preferencesSchema = z.object({
  theme: z.enum(["dark", "light"]).default("dark"),
  accentColor: z.enum(["violet", "blue", "teal", "green", "amber", "orange", "rose", "red"]).default("violet"),
  language: z.enum(["en", "fr"]).default("en"),
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default(DEFAULT_TMDB_REGION),
  defaultSearchType: z.enum(["all", "movie", "series"]).default("all"),
  reduceMotion: z.boolean().default(false),
  compactMode: z.boolean().default(false),
  sidebarCollapsed: z.boolean().default(false),
  libraryViewMode: z.enum(["grid", "list"]).default("grid"),
  spoilerProtection: z.boolean().default(true),
  notificationsEnabled: z.boolean().default(false),
  notifyHoursBefore: z.number().int().min(0).max(168).default(24),
  preferredProviderIds: z.array(z.number().int().positive()).default([]),
  activeProfileId: z.string().default("default"),
  userProfile: z.object({
    id: z.string().default("default"),
    name: z.string().nullable().default(null),
    avatar: z.string().nullable().optional(),
  }),
});

export const defaultPreferences: UserPreferences = preferencesSchema.parse({
  userProfile: {},
});

// Reading/writing/caching preferences now happens in Rust (see
// src-tauri/src/commands/preferences.rs) — this repository is a thin
// invoke() wrapper. `preferencesSchema`/`defaultPreferences` above stay here
// because backup-schema.ts still validates restored backups against them.
export const preferencesRepository = {
  async getPreferences(): Promise<UserPreferences> {
    return invokeCommand<UserPreferences>("get_preferences");
  },

  async updatePreference<Key extends Exclude<keyof UserPreferences, "activeProfileId">>(
    key: Key,
    value: UserPreferences[Key]
  ): Promise<UserPreferences> {
    return invokeCommand<UserPreferences>("update_preference", { key, value });
  },

  // The only legitimate way to switch activeProfileId — Rust rejects it via
  // the generic updatePreference above. See set_active_profile_impl's own
  // doc comment (src-tauri/src/commands/preferences.rs) for what
  // supabaseUserId does and doesn't prove.
  async setActiveProfile(profileId: string, supabaseUserId?: string | null): Promise<UserPreferences> {
    return invokeCommand<UserPreferences>("set_active_profile", { profileId, supabaseUserId: supabaseUserId ?? null });
  },

  // Callers that write preferences storage directly (bulk backup restore)
  // must call this so the next getPreferences() re-reads instead of serving
  // a now-stale cached value.
  async refresh(): Promise<void> {
    await invokeCommand<void>("refresh_preferences");
  },
};
