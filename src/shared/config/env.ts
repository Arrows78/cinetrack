import { z } from "zod";
import { isTauriApp } from "@/shared/lib/platform";

const envSchema = z.object({ VITE_TMDB_API_TOKEN: z.string().min(1).optional() });
const parsed = envSchema.safeParse(import.meta.env);
export const env = parsed.success ? parsed.data : { VITE_TMDB_API_TOKEN: undefined };

const browserToken = typeof window === "undefined" ? null : window.localStorage.getItem("cinetrack.tmdb-token");
export const hasTmdbToken = Boolean(env.VITE_TMDB_API_TOKEN || browserToken) || isTauriApp();
