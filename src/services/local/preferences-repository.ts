import { z } from 'zod';
import { browserStore, getDatabase } from './db';
import type { UserPreferences } from '@/types/media';

const preferencesSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  defaultSearchType: z.enum(['all', 'movie', 'series']).default('all'),
  defaultWatchlistFilter: z.enum(['all', 'movie', 'series']).default('all'),
  reduceMotion: z.boolean().default(false),
  compactMode: z.boolean().default(false),
});

export const defaultPreferences: UserPreferences = {
  theme: 'dark',
  defaultSearchType: 'all',
  defaultWatchlistFilter: 'all',
  reduceMotion: false,
  compactMode: false,
};

export const preferencesRepository = {
  async getPreferences(): Promise<UserPreferences> {
    const db = await getDatabase();

    if (!db) {
      return preferencesSchema.parse({
        ...defaultPreferences,
        ...browserStore.read().preferences,
      });
    }

    const rows = await db.select<Array<{ key: string; value: string }>>(
      'SELECT key, value FROM preferences',
    );

    const raw = rows.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.key] = JSON.parse(row.value);
      return acc;
    }, {});

    return preferencesSchema.parse({
      ...defaultPreferences,
      ...raw,
    });
  },

  async updatePreference<Key extends keyof UserPreferences>(
    key: Key,
    value: UserPreferences[Key],
  ): Promise<UserPreferences> {
    const db = await getDatabase();

    if (!db) {
      const store = browserStore.read();
      store.preferences = { ...store.preferences, [key]: value };
      browserStore.write(store);
      return this.getPreferences();
    }

    await db.execute(
      'INSERT OR REPLACE INTO preferences (key, value) VALUES ($1, $2)',
      [key, JSON.stringify(value)],
    );

    return this.getPreferences();
  },
};
