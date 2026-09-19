# Authentication setup

CineTrack can remain local-only, or require an account backed by Clerk.
Supabase Postgres stays the sync/community backend; it no longer issues
identity. Clerk issues the session JWT, Supabase validates it through its
native Third-Party Auth integration, and RLS scopes every cloud row to
`requesting_user_id()` (the JWT `sub`, a Clerk id like `user_xxx`).

Authentication identifies the current user and gates the interface.
Existing library, progress, activity, and preferences remain stored
locally, partitioned by profile: each Clerk account is linked to exactly
one local profile (see `docs/database-schema.md`) — the first account to
sign in on a machine claims the pre-existing `'default'` profile, every
account after that gets its own. The SQLite column and Tauri command
names still say `supabase_user_id`; that string is now the Clerk `sub`.
Cross-device continuity is the sync engine (`docs/cloud-sync-community.md`),
not this identity layer.

The desktop app talks to Clerk in native mode inside the Tauri webview
(`standardBrowser: false`, client JWT in `localStorage`, FAPI via
`tauri-plugin-http`). Use `pnpm tauri dev` for real auth+sync testing.
`pnpm dev` in a browser tab can sign in, but SQLite/IPC is unavailable
there.

## 1. Create and configure Clerk

1. Create a Clerk application and copy the **publishable** key
   (`pk_test_...` / `pk_live_...`).
2. In **Configure → SSO connections**, enable every social provider
   CineTrack should offer: Google, Apple, Facebook, X.
3. Enable **Email** with a one-time code (Clerk's email factor is a fixed
   6-digit code).
4. In **Configure → Native applications** (or Redirect URLs), add exactly:
   - `http://127.0.0.1:7420/auth/callback` (desktop OAuth loopback)
   - `cinetrack://auth/callback` (iOS / installed macOS `.app` bundle)
   - `http://localhost:1420/`
   - the production web URL if a web build is deployed

   The `redirectUrl` sent by the application must match an allowed entry
   exactly. Clerk production instances are stricter than development
   about allowed redirect URLs — reconfirm before a general release.

5. In **User & authentication**, keep "sign-in does not create an
   account" (or the equivalent). CineTrack's Sign in tab calls Clerk
   `signIn`; Sign up calls `signUp`. A sign-in must never silently create
   a user.

Provider client secrets stay in the Clerk Dashboard. Never put them in
the desktop application's `.env` file.

## 2. Connect Clerk to Supabase (Third-Party Auth)

Do this before any end-to-end sync test. The old Clerk "Supabase" JWT
template is deprecated (1 April 2025) and is not used.

1. In the Clerk Dashboard, open the **Supabase** integration setup and
   activate it. That stamps `"role": "authenticated"` on every session
   token. Without this claim, PostgREST stays `anon` and the
   `apply_sync_batch` / `pull_sync_changes` grants never match.
2. Copy the revealed **Clerk domain** (JWKS issuer).
3. In the Supabase Dashboard: **Authentication → Sign In / Providers →
   Third-Party Auth** (or the equivalent Third-Party Auth page) → add
   **Clerk** → paste the Clerk domain.

The TypeScript client then does `session.getToken()` with **no**
`{ template: "supabase" }` and passes the result through
`createClient(..., { accessToken })`
(`src/shared/lib/supabase-data-client.ts`).

Apply `supabase/migrations/20260919120000_clerk_identity.sql` on a
**test** project first (`supabase db push`). It is a one-shot cutover:
identity columns become `text`, FKs to `auth.users` are dropped, and
every policy reads `requesting_user_id()`. Existing `sync_*` rows owned
by a Supabase Auth UUID will no longer match any Clerk `sub` — reconcile
or wipe before a production push.

A two-user isolation check lives in
`supabase/tests/clerk_identity_isolation.sql`.

## 3. Email code

Clerk sends a 6-digit email code. `VITE_AUTH_OTP_LENGTH` is gone;
`authConfig.otpLength` is hard-coded to 6.

**Sign in** uses `signIn.create` + `prepareFirstFactor({ strategy:
'email_code' })`. If the identifier has no email-code factor, the UI
shows "no account" — it does not create one.

**Sign up** uses `signUp.create` + `prepareEmailAddressVerification`.

For production, configure Clerk's email/SMTP settings for deliverability
and sending limits.

## 4. OAuth providers

OAuth does **not** run inside the Tauri webview. The app opens the
system browser, then comes back through:

- `pnpm tauri dev`: `http://127.0.0.1:7420/auth/callback` (RFC 8252).
  Launch Services will not deliver `cinetrack://` to a raw `tauri dev`
  binary. Runtime `register()` is unsupported on macOS.
- Bundled `.app` / iOS: `cinetrack://auth/callback`. The scheme is in
  `src-tauri/Info.plist` and `plugins.deep-link.desktop.schemes`. Install
  the app under `/Applications` once so macOS indexes it.

Flow (same idea as Clerk Expo `startSSOFlow`):

1. `signIn.create({ strategy: 'oauth_<provider>', redirectUrl })`
2. Open `externalVerificationRedirectURL` with
   `@tauri-apps/plugin-opener` (https only)
3. Clerk redirects the browser to the URL from step 1
   (`127.0.0.1:7420` in Vite dev, `cinetrack://` in a bundle)
4. The loopback server or `RunEvent::Opened` emits `cinetrack:deep-link`
5. `signIn.reload({ rotatingTokenNonce })`; if the factor is
   `transferable`, `signUp.create({ transfer: true })`
6. `setActive({ session: createdSessionId })`

Each provider's callback URL in Google / Apple / Facebook / X is
Clerk's, not Supabase's and not `cinetrack://`. Copy that URL from the
Clerk Dashboard connection for the provider.

### Google

Web application OAuth client. Authorized redirect URI = Clerk's Google
callback (Dashboard → SSO → Google).

### Facebook

Facebook Login. Valid OAuth Redirect URI = Clerk's Facebook callback.
Request the email address.

### Apple

Services ID for Sign in with Apple, pointed at the Clerk domain and
Clerk callback. Apple only provides the full name on the first
authorization — do not rely on `full_name` to identify an account.

### X

Use Clerk's `oauth_x` connection (X / Twitter OAuth 2.0). CineTrack's
UI value is `x`.

## 5. Configure CineTrack

Copy `.env.example` to `.env` and set:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_AUTH_REQUIRED=true
VITE_AUTH_DESKTOP_REDIRECT_URL=cinetrack://auth/callback
VITE_AUTH_WEB_REDIRECT_URL=http://localhost:1420/
VITE_AUTH_OTP_RESEND_SECONDS=60
VITE_TERMS_URL=https://example.com/terms
VITE_PRIVACY_URL=https://example.com/privacy
```

Only use public publishable keys. Never place a Clerk secret or a
Supabase `service_role` key in a Vite variable.

Set `VITE_AUTH_REQUIRED=false` to keep the account-free, local-only
experience.

CineTrack reads Clerk's public `/v1/environment` and only displays
social providers that are enabled there. If that request fails, the
buttons stay visible and the screen shows a warning.

## 6. Tauri and deep links

The repository already wires up:

- The `cinetrack` desktop scheme in `tauri.conf.json`.
- `tauri-plugin-deep-link`.
- `tauri-plugin-single-instance` with the `deep-link` feature — it must
  remain the first registered plugin, and also brings the main window to
  the foreground when the browser completes an OAuth flow.
- `tauri-plugin-http`, scoped in `capabilities/default.json` to
  `https://*.clerk.accounts.dev/*`.
- Runtime deep-link registration for development on Windows and Linux.
- A localhost OAuth callback server on `127.0.0.1:7420` (desktop only),
  started at boot, because macOS cannot deliver `cinetrack://` to
  `pnpm tauri dev`.

The callback protocol, host, and path are validated before the nonce is
exchanged. A bundled `.app` (plus `src-tauri/Info.plist`) is what makes
`cinetrack://` work on macOS — OAuth in that build, and movie/series
links. `pnpm tauri dev` OAuth stays on the loopback server. Email-code
does not need a bundle.

Production Clerk instances may reject a `redirectUrl` that was allowed
in development. Confirm the allow-list before release.

A custom Clerk Frontend API domain (not `*.clerk.accounts.dev`) must be
added to CSP `connect-src` and to the `http:default` allow list.

## 7. Security checklist

- Never use `service_role` in the frontend.
- `unsafeMetadata.marketing_opt_in` is user-writable — do not use it for
  authorization decisions.
- Enable RLS on every remote table that contains user data.
- Scope policies with `(select requesting_user_id())`, never a
  client-supplied `user_id` and never `auth.uid()` (Clerk ids are not
  UUIDs; `auth.uid()` cannot hold them).
- Limit Clerk Redirect URLs to addresses that are actually used.
- `script-src 'self'` must stay intact. clerk-js is bundled. If Clerk
  bot-protection starts injecting Cloudflare/Turnstile scripts, add those
  hosts explicitly rather than opening `script-src` to the network.
- Check Clerk and Supabase logs and rate limits before releasing.

Minimal policy example:

```sql
alter table public.example enable row level security;

create policy "Users can read their own rows"
on public.example
for select
using ((select requesting_user_id()) = user_id);

create policy "Users can insert their own rows"
on public.example
for insert
with check ((select requesting_user_id()) = user_id);
```

## 8. Install, build, and test

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Manual test flow (`pnpm tauri dev`):

1. Sign up with email code, then sign out and sign in with the same email.
2. Test an unknown email in Sign in mode — no account should be created.
3. Verify the resend button stays disabled for the configured delay.
4. Test Google and at least one other enabled provider in
   `pnpm tauri dev` (Safari lands on `127.0.0.1:7420`) and on a bundled
   `.app` installed in `/Applications` (`cinetrack://auth/callback`).
   Movie/series `cinetrack://` links also need that bundle on macOS.
5. Sync: device A with an existing library, device B empty, run sync,
   confirm convergence (`docs/cloud-sync-community.md`).
