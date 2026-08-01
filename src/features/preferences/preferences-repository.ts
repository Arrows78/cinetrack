import { z } from "zod";
import { invokeCommand } from "@/shared/lib/invoke";
import type { UserPreferences } from "@/types/media";

export const preferencesSchema = z.object({
  theme: z.enum(["dark", "light"]).default("dark"),
  accentColor: z.enum(["violet", "blue", "teal", "green", "amber", "orange", "rose", "red"]).default("violet"),
  language: z.enum(["en", "fr"]).default("en"),
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("FR"),
  defaultSearchType: z.enum(["all", "movie", "series"]).default("all"),
  defaultWatchlistFilter: z.enum(["all", "movie", "series"]).default("all"),
  reduceMotion: z.boolean().default(false),
  compactMode: z.boolean().default(false),
  sidebarCollapsed: z.boolean().default(false),
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

  async updatePreference<Key extends keyof UserPreferences>(
    key: Key,
    value: UserPreferences[Key]
  ): Promise<UserPreferences> {
    return invokeCommand<UserPreferences>("update_preference", { key, value });
  },

  // Callers that write preferences storage directly (bulk backup restore)
  // must call this so the next getPreferences() re-reads instead of serving
  // a now-stale cached value.
  async refresh(): Promise<void> {
    await invokeCommand<void>("refresh_preferences");
  },
};
