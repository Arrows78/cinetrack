import { z } from "zod";
import { preferencesCommands } from "@/features/preferences/preferences-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
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
  activeProfileId: z.string().default(DEFAULT_PROFILE_ID),
  backupDirectory: z.string().nullable().default(null),
  hideWatchedInDiscovery: z.boolean().default(false),
  onThisDayEnabled: z.boolean().default(false),
  onboardingCompleted: z.boolean().default(false),
  userProfile: z.object({
    id: z.string().default(DEFAULT_PROFILE_ID),
    name: z.string().nullable().default(null),
    // Still accepts `null` so a backup written before avatar's wire shape
    // tightened to "omitted or string" (never an explicit null, see
    // src-tauri/src/preferences/models.rs's UserProfile) still restores —
    // normalized to `undefined` here to match UserProfile's generated type.
    avatar: z
      .string()
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
  }),
});

export const defaultPreferences: UserPreferences = preferencesSchema.parse({
  userProfile: {},
});

// Reading/writing/caching preferences now happens in Rust (see
// src-tauri/src/preferences/) — this repository is a thin
// invoke() wrapper. `preferencesSchema`/`defaultPreferences` above stay here
// because backup-schema.ts still validates restored backups against them.
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
  async setActiveProfile(profileId: string, supabaseUserId?: string | null): Promise<UserPreferences> {
    return invokeTypedCommand(preferencesCommands.setActiveProfile, {
      profileId,
      supabaseUserId: supabaseUserId ?? null,
    });
  },

  // Callers that write preferences storage directly (bulk backup restore)
  // must call this so the next getPreferences() re-reads instead of serving
  // a now-stale cached value.
  async refresh(): Promise<void> {
    await invokeTypedCommand(preferencesCommands.refresh);
  },
};
