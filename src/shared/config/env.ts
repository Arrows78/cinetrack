import { z } from "zod";
import { isTauriApp } from "@/shared/lib/platform";
import { BROWSER_TOKEN_KEY } from "@/shared/constants/local-storage-keys";

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

// Plaintext fallback for the browser-preview path only (`pnpm dev` outside the
// Tauri window, see token-vault.ts) — there's no real security boundary to
// protect there anyway (no SQLite, no Stronghold). The actual encrypted path
// used inside the Tauri app is Stronghold, in token-vault.ts.
const browserToken = typeof window === "undefined" ? null : window.localStorage.getItem(BROWSER_TOKEN_KEY);
export const hasTmdbToken = Boolean(env.VITE_TMDB_API_TOKEN || browserToken) || isTauriApp();
