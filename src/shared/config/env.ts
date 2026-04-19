import { z } from "zod";

const envSchema = z.object({
  VITE_TMDB_API_TOKEN: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(import.meta.env);

export const env = parsed.success
  ? parsed.data
  : {
      VITE_TMDB_API_TOKEN: undefined,
    };

export const hasTmdbToken = Boolean(env.VITE_TMDB_API_TOKEN);
