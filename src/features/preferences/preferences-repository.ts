import { z } from "zod";
import { browserStore, getDatabase } from "@/db/client";
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

// Preferences are read constantly (every TMDB request and most repository
// calls resolve the active profile/language/region through this module), but
// this app is a single window/instance, so an in-memory cache invalidated on
// every write is always fresh and avoids a SQLite/localStorage round trip per
// call.
let cache: UserPreferences | null = null;

export const preferencesRepository = {
  async getPreferences(): Promise<UserPreferences> {
    if (cache) return cache;

    const db = await getDatabase();
    if (!db) {
      cache = preferencesSchema.parse({ ...defaultPreferences, ...browserStore.read().preferences });
      return cache;
    }

    const rows = await db.select<Array<{ key: string; value: string }>>("SELECT key, value FROM preferences");
    const raw = rows.reduce<Record<string, unknown>>((acc, row) => {
      try {
        acc[row.key] = JSON.parse(row.value);
      } catch {
        // Ignore invalid legacy values and fall back to defaults.
      }
      return acc;
    }, {});

    cache = preferencesSchema.parse({ ...defaultPreferences, ...raw });
    return cache;
  },

  async updatePreference<Key extends keyof UserPreferences>(
    key: Key,
    value: UserPreferences[Key]
  ): Promise<UserPreferences> {
    const current = await this.getPreferences();
    const parsed = preferencesSchema.parse({ ...current, [key]: value })[key];
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();
      store.preferences = { ...store.preferences, [key]: parsed };
      browserStore.write(store);
    } else {
      await db.execute("INSERT OR REPLACE INTO preferences (key, value) VALUES ($1, $2)", [
        key,
        JSON.stringify(parsed),
      ]);
    }

    cache = { ...current, [key]: parsed };
    return cache;
  },

  // Callers that write preferences storage directly (bulk backup restore)
  // must call this so the next getPreferences() re-reads instead of serving
  // a now-stale cached value.
  invalidate(): void {
    cache = null;
  },
};
