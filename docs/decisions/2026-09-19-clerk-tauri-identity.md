# Clerk on Tauri: session and OAuth verdict

Date: 2026-09-19

CineTrack keeps Supabase Postgres/RLS/Realtime as the sync backend and
replaces Supabase Auth with Clerk as the only identity issuer. This note
records the Tauri-specific choices that make that split work. There is no
disposable spike harness left in the tree: the production modules
(`src/shared/lib/clerk-instance.ts`, `src/features/auth/auth-provider.tsx`)
are the implementation of the spike.

## Session (email-code) — implemented

Clerk has no official Tauri SDK. `@clerk/react` widgets and CDN-hotloaded
`clerk-js` are unusable here (`script-src 'self'`, WKWebView cookies).

The working stack:

- `@clerk/react` + `@clerk/clerk-js`, instance constructed in-process and
  passed to `ClerkProvider` (`Clerk={...}`). No CDN script.
- In the Tauri webview: `clerk.load({ standardBrowser: false })`, plus an
  Expo-style `__client` JWT cache on `getFapiClient()` so a reload does
  not 401 the session touch.
- FAPI traffic is routed through `@tauri-apps/plugin-http` (no browser
  `Origin` header). That avoids Clerk's
  `origin_authorization_headers_conflict`. TMDB and Supabase keep using
  the webview `fetch`.
- CSP: `connect-src https://*.clerk.accounts.dev`, `img-src https://img.clerk.com`,
  `script-src 'self'` unchanged. Bot-protection (`*.protect.clerk.com`,
  Cloudflare Turnstile) is not opened until a live instance proves it
  injects frames or scripts.

`pnpm tauri dev` is the development surface. A production/debug bundle is
only needed to reconfirm macOS `cinetrack://` movie/series links (Launch
Services will not associate a custom scheme with the raw `tauri dev`
binary). OAuth does not wait on that bundle.

## OAuth — implemented (required)

OAuth is a product requirement, not a fallback. The Expo `startSSOFlow`
pattern is ported, not `authenticateWithRedirect` inside the webview:

1. `signIn.create({ strategy: oauth_*, redirectUrl })`
2. Open `firstFactorVerification.externalVerificationRedirectURL` in the
   system browser (`plugin-opener`)
3. Clerk redirects to `http://127.0.0.1:7420/auth/callback?rotating_token_nonce=...`
   (loopback server in `src-tauri/src/auth/oauth_callback.rs`). `cinetrack://`
   is not delivered to `tauri dev` on macOS.
4. `signIn.reload({ rotatingTokenNonce })`, transfer into `signUp.create`
   when the identity is new, then `setActive({ session })`

Register `http://127.0.0.1:7420/auth/callback`, `cinetrack://auth/callback`,
and the web-preview URL as Clerk Redirect URLs. Provider secrets stay in
the Clerk Dashboard.

Live confirmation against a real Clerk instance (email-code + Google +
one other provider, cold and warm start) still has to be done by a human
with dashboard access. Unit tests cover the handshake and the email-code
prepare/attempt split.

## Supabase Third-Party Auth

Activate Clerk's Supabase integration in the Clerk Dashboard so every
session token carries `"role": "authenticated"`. Then add the Clerk
domain under Supabase Authentication → Third-Party Auth. Client code
calls `session.getToken()` with no JWT template.

RLS reads `requesting_user_id()` (`auth.jwt()->>'sub'`). Identity columns
are `text`. `profiles.supabase_user_id` keeps its name and now stores the
Clerk `sub`.
