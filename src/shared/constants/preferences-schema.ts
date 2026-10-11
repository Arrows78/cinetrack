import { z } from "zod";
import { DEFAULT_PREFERRED_REGION } from "@/shared/constants/discover";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { UserPreferences } from "@/types/media";

// Kept apart from preferences-repository.ts (which talks to Rust over IPC) so
// that reading a default, or validating a restored backup, never drags the
// repository into a module graph that mocks it.
//
// Rust owns the stored defaults (UserPreferences::default()); the values below
// only restore backups and stand in while preferences are still loading.
// `default-preferences.json` pins both sides to the same document.
export const preferencesSchema = z.object({
  theme: z.enum(["dark", "light"]).default("dark"),
  accentColor: z.enum(["violet", "blue", "teal", "green", "amber", "orange", "rose", "red"]).default("violet"),
  language: z.enum(["en", "fr"]).default("en"),
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default(DEFAULT_PREFERRED_REGION),
  defaultSearchType: z.enum(["all", "movie", "series", "person"]).default("all"),
  reduceMotion: z.boolean().default(false),
  compactMode: z.boolean().default(false),
  sidebarCollapsed: z.boolean().default(false),
  libraryViewMode: z.enum(["grid", "list"]).default("grid"),
  spoilerProtection: z.boolean().default(true),
  notificationsEnabled: z.boolean().default(false),
  availabilityAlertsEnabled: z.boolean().default(false),
  desktopNotificationsEnabled: z.boolean().default(false),
  notifyHoursBefore: z.number().int().min(0).max(168).default(24),
  availabilityCheckIntervalHours: z.number().int().min(1).max(24).default(6),
  preferredProviderIds: z.array(z.number().int().positive()).default([]),
  activeProfileId: z.string().default(DEFAULT_PROFILE_ID),
  backupDirectory: z.string().nullable().default(null),
  backupFrequency: z.enum(["daily", "weekly", "off"]).default("daily"),
  hideWatchedInDiscovery: z.boolean().default(false),
  onThisDayEnabled: z.boolean().default(false),
  onboardingCompleted: z.boolean().default(false),
  recentSearches: z.array(z.string()).max(8).default([]),
  tourCompleted: z.boolean().default(false),
  commandPaletteShortcut: z.string().min(1).default("mod+k"),
  globalCommandPaletteShortcut: z.string().min(1).default("mod+shift+k"),
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
