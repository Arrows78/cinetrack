import { z } from "zod";
import { isTauriApp } from "@/shared/lib/platform";

const envSchema = z.object({ VITE_TMDB_API_TOKEN: z.string().min(1).optional() });
// Read only in development (`pnpm dev` / `pnpm tauri dev`), and by naming the one variable rather
// than parsing the whole `import.meta.env`: Vite replaces `import.meta.env.DEV` with `false` in a
// production build, so the token (and every other VITE_ variable) is dropped from the bundle
// instead of being inlined into it. A release build gets its TMDB token from the Stronghold vault
// (token-vault.ts) and hands it to the Rust side, never from the build environment.
const parsed = envSchema.safeParse({
  VITE_TMDB_API_TOKEN: import.meta.env.DEV ? import.meta.env.VITE_TMDB_API_TOKEN : undefined,
});
export const env = parsed.success ? parsed.data : { VITE_TMDB_API_TOKEN: undefined };

// Browser preview tokens entered at runtime are intentionally memory-only
// (token-vault.ts), so this static bootstrap flag only knows about the dev env
// token. Native Tauri builds can unlock Stronghold after startup.
export const hasTmdbToken = Boolean(env.VITE_TMDB_API_TOKEN) || isTauriApp();
