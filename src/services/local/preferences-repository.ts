import { z } from "zod";
import { browserStore, getDatabase } from "./db";
import type { UserPreferences } from "@/types/media";

const preferencesSchema = z.object({
  theme: z.enum(["dark", "light"]).default("dark"),
  accentColor: z.enum(["violet", "blue", "teal", "green", "amber", "orange", "rose", "red"]).default("violet"),
  language: z.enum(["en", "fr"]).default("en"),
  region: z.string().regex(/^[A-Z]{2}$/).default("FR"),
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
  userProfile: {}
});

export const preferencesRepository = {
  async getPreferences(): Promise<UserPreferences> {
    const db = await getDatabase();
    if (!db) {
      return preferencesSchema.parse({ ...defaultPreferences, ...browserStore.read().preferences });
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

    return preferencesSchema.parse({ ...defaultPreferences, ...raw });
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
      return this.getPreferences();
    }

    await db.execute("INSERT OR REPLACE INTO preferences (key, value) VALUES ($1, $2)", [key, JSON.stringify(parsed)]);
    return this.getPreferences();
  },
};
