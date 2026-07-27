# Authentication setup

CineTrack can remain local-only, or require an account backed by Supabase Auth. The implementation uses PKCE for OAuth, a `cinetrack://auth/callback` deep link in Tauri, and six-digit email OTPs for passwordless email sign-in.

Authentication identifies the current user and gates the interface. Existing watchlist, progress, activity, and preferences remain stored locally; it does not sync or partition local SQLite data by user. Add a remote sync layer or a per-user local database migration before promising cross-device accounts.

## 1. Create and configure the Supabase project

1. Create a Supabase project and copy its project URL and publishable key.
2. In **Authentication → URL Configuration**, set:
   - **Site URL**: `http://localhost:1420/` for development.
   - **Redirect URLs**: `cinetrack://auth/callback` and `http://localhost:1420/`, plus the production web URL when a web build is deployed.

   The `redirectTo` sent by the application must match an allowed entry exactly. Avoid wildcards in production when an exact URL is sufficient.
3. In **Authentication → Sign In / Providers**, configure and enable every social provider CineTrack should offer: Google, Apple, Facebook, X (see provider-specific steps below).
4. Keep **Email** enabled — see [Email OTP](#2-email-otp-authentication) below.

Two different redirect URLs are involved, and mixing them up is the most common setup mistake:

- The OAuth provider redirects to **Supabase**: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Supabase redirects back to **CineTrack**: `cinetrack://auth/callback`.

Provider client secrets stay in Supabase. Never put them in the desktop application's `.env` file.

## 2. Email OTP authentication

In **Authentication → Sign In / Providers → Email**:

1. Enable the Email provider.
2. Keep the code length consistent with `VITE_AUTH_OTP_LENGTH`.
3. Configure the code expiration.
4. Keep the resend interval consistent with `VITE_AUTH_OTP_RESEND_SECONDS`; Supabase uses 60 seconds by default.

In **Authentication → Email Templates → Magic Link**, replace the magic link with the code, since CineTrack expects a 6-digit OTP, not a clickable link:

```html
<h2>Your CineTrack code</h2>
<p>Enter this code in the application: <strong>{{ .Token }}</strong></p>
```

Supabase uses the same mechanism for Magic Link and Email OTP — without `{{ .Token }}` in the template, the CineTrack interface will expect a code that never appears in the email.

**Sign in** sends `shouldCreateUser: false`. **Sign up** sends `shouldCreateUser: true`. This prevents a sign-in attempt from silently creating an account.

For production, configure custom SMTP in **Authentication → SMTP Settings** to control deliverability and sending limits.

## 3. OAuth providers

All external providers use the same provider-side callback:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

### Google

In Google Cloud Console:

1. Create and configure the OAuth consent screen.
2. Create an OAuth client of type **Web application**.
3. Add the Supabase callback URL above to **Authorized redirect URIs**.
4. Copy the Client ID and Client Secret to **Supabase → Authentication → Sign In / Providers → Google**.

### Facebook

In Meta for Developers:

1. Create an application and add Facebook Login.
2. Add the Supabase callback URL to **Valid OAuth Redirect URIs**.
3. Allow access to the email address, which the standard Supabase flow requires.
4. Copy the App ID and App Secret to the Facebook provider in Supabase.

### Apple

For the web flow opened by Tauri:

1. Create and configure a Services ID for Sign in with Apple.
2. Declare the Supabase domain and the Supabase callback URL.
3. Create the Apple key and retrieve the Team ID, Key ID, and private key.
4. Generate and configure the secret required by Supabase.
5. Plan for Apple secret rotation when it applies to your web configuration.

Apple only provides the full name during the first authorization and does not always include it in later tokens — do not rely on `full_name` to identify an account.

### X

Use the **X / Twitter OAuth 2.0** provider, not the legacy OAuth 1.0a provider:

1. Create a project and application in the X Developer Portal.
2. Select a Web application.
3. Enable the email address request if needed.
4. Add the Supabase callback URL.
5. Copy the Client ID and Client Secret to the **X / Twitter OAuth 2.0** provider in Supabase.

The current Supabase SDK expects the provider value `x`, so CineTrack's UI layer also uses `x` — `twitter` is the legacy OAuth 1.0a provider and will not work.

## 4. Configure CineTrack

Copy `.env.example` to `.env` and set:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_AUTH_REQUIRED=true
VITE_AUTH_DESKTOP_REDIRECT_URL=cinetrack://auth/callback
VITE_AUTH_WEB_REDIRECT_URL=http://localhost:1420/
VITE_AUTH_OTP_LENGTH=6
VITE_AUTH_OTP_RESEND_SECONDS=60
VITE_TERMS_URL=https://example.com/terms
VITE_PRIVACY_URL=https://example.com/privacy
```

Only use the public **publishable** key. Never place a `secret` or `service_role` key in a Vite variable — it would be inlined into the distributed application's bundle (see the security note in the main README about `VITE_TMDB_API_TOKEN`, which has the same failure mode).

Set `VITE_AUTH_REQUIRED=false` to preserve the account-free, local-only experience.

CineTrack reads Supabase's public Auth settings endpoint and only displays social providers that are enabled there. If the settings endpoint cannot be reached, the buttons remain visible and the screen displays a warning.

## 5. Verify the provider configuration

Use the publishable key to inspect the public Auth settings:

```bash
curl --silent \
  --header "apikey: <publishable-key>" \
  "https://<project-ref>.supabase.co/auth/v1/settings"
```

The `external` object must contain `true` for each configured social provider, for example:

```json
{
  "external": {
    "facebook": true,
    "google": true,
    "x": true
  }
}
```

When Supabase returns `Unsupported provider: provider is not enabled`, the request reached the correct Supabase project, but that provider is disabled or its OAuth credentials were not saved — this cannot be fixed by changing `redirectTo` in the desktop app.

## 6. Tauri and deep links

The repository already wires up:

- The `cinetrack` desktop scheme in `tauri.conf.json`.
- `tauri-plugin-deep-link`.
- `tauri-plugin-single-instance` with the `deep-link` feature — it must remain the first registered plugin, and also brings the main window to the foreground when the browser completes an OAuth flow.
- Runtime deep-link registration for development on Windows and Linux.

The callback protocol, host, and path are validated before the PKCE exchange. Test deep links with an installed or bundled application, especially on macOS, where protocol association depends on the bundle.

## 7. Supabase security checklist

- Never use `service_role` in the frontend.
- Users can modify `user_metadata` fields, including `marketing_opt_in` — do not use them for authorization decisions.
- Enable RLS (row level security) on every remote table that contains user data.
- Use policies based on `auth.uid()`.
- Limit Redirect URLs to addresses that are actually used.
- Enable CAPTCHA if public endpoints are targeted by abuse.
- Check Auth logs and rate limits before releasing to production.

Minimal policy example for a table with a `user_id` column:

```sql
alter table public.example enable row level security;

create policy "Users can read their own rows"
on public.example
for select
using (auth.uid() = user_id);

create policy "Users can insert their own rows"
on public.example
for insert
with check (auth.uid() = user_id);
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

Manual test flow:

1. Run `pnpm dev` and test the email code in Sign up mode.
2. Sign out, then test the same email in Sign in mode.
3. Test an unknown email in Sign in mode — no account should be created.
4. Verify the resend button stays disabled for the configured delay.
5. Test each enabled provider in the browser.
6. Run `pnpm tauri dev`, start an OAuth flow, and verify the return to CineTrack.
7. Test with CineTrack already open, minimized, and closed — desktop deep links are registered by installed application bundles, so this matters most on a real bundled build, not just `pnpm tauri dev`.
