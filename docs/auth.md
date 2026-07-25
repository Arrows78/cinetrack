# Authentication setup

CineTrack can remain local-only, or require an account backed by Supabase Auth. The implementation uses PKCE for OAuth, a `cinetrack://auth/callback` deep link in Tauri, and six-digit email OTPs for passwordless email sign-in.

## 1. Create and configure Supabase

1. Create a Supabase project and copy its project URL and publishable key.
2. In **Authentication → URL Configuration**, add these redirect URLs:
   - `cinetrack://auth/callback`
   - `http://localhost:1420/`
   - the production web URL, when a web build is deployed.
3. In **Authentication → Sign In / Providers**, configure and enable every social provider that CineTrack should offer:
   - Apple
   - Facebook
   - Google
   - X / Twitter
4. For each social provider, first create an OAuth application in that provider's developer console. Register Supabase's callback URL there:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
5. Copy the provider client ID and secret into the matching Supabase provider panel, switch the provider on, and save it.
6. Keep **Email** enabled. In **Authentication → Email Templates → Magic Link**, include `{{ .Token }}` in the message so the user receives the six-digit OTP expected by the CineTrack screen.

The two redirect URLs have different purposes:

- The provider console redirects to Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Supabase redirects back to CineTrack: `cinetrack://auth/callback`.

Provider client secrets stay in Supabase. Never put them in the desktop application's `.env` file.

## 2. Configure CineTrack

Copy `.env.example` to `.env` and set:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
VITE_AUTH_REQUIRED=true
VITE_AUTH_DESKTOP_REDIRECT_URL=cinetrack://auth/callback
VITE_AUTH_WEB_REDIRECT_URL=http://localhost:1420/
VITE_TERMS_URL=https://example.com/terms
VITE_PRIVACY_URL=https://example.com/privacy
```

Set `VITE_AUTH_REQUIRED=false` to preserve the existing account-free, local-only experience.

CineTrack reads Supabase's public Auth settings endpoint and only displays social providers that are enabled. If the settings endpoint cannot be reached, the buttons remain visible and the screen displays a warning.

## 3. Verify the Supabase provider configuration

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

When Supabase returns `Unsupported provider: provider is not enabled`, the request reached the correct Supabase project, but that provider is disabled or its OAuth credentials were not saved. This cannot be fixed by changing `redirectTo` in the desktop app. CineTrack maps its X button to Supabase's OAuth 2.0 provider identifier, `x`; `twitter` is the legacy OAuth 1.0a provider.

## 4. Install and test

The authentication changes require Supabase and the Tauri deep-link/opener plugins. Regenerate lockfiles before committing:

```bash
pnpm install
cd src-tauri && cargo check && cd ..
pnpm lint
pnpm build
```

Desktop deep links are registered by installed application bundles. On Windows and Linux, the debug build also registers the configured scheme at runtime through Tauri's deep-link integration. Test the bundled application before release, especially on macOS.

## Scope

Authentication identifies the current user and gates the interface. Existing watchlist, progress, activity and preferences remain stored locally; this patch does not sync or partition local SQLite data by user. Add a remote sync layer or a per-user local database migration before promising cross-device accounts.
