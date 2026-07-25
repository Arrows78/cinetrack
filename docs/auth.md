# Authentication setup

CineTrack can remain local-only, or require an account backed by Supabase Auth. The implementation uses PKCE for OAuth, a `cinetrack://auth/callback` deep link in Tauri, and six-digit email OTPs for passwordless email sign-in.

## 1. Create and configure Supabase

1. Create a Supabase project and copy its project URL and publishable key.
2. In **Authentication → URL Configuration**, add these redirect URLs:
   - `cinetrack://auth/callback`
   - `http://localhost:1420/`
   - the production web URL, when a web build is deployed.
3. Enable the desired providers in **Authentication → Providers**:
   - Apple
   - Facebook
   - Google
   - X / Twitter (OAuth 2.0)
   - Email
4. In **Authentication → Email Templates → Magic Link**, include `{{ .Token }}` in the message so the user receives the six-digit OTP expected by the CineTrack screen.
5. In each social provider console, use Supabase's provider callback URL:
   - `https://<project-ref>.supabase.co/auth/v1/callback`

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

## 3. Install and test

The patch changes `package.json` and the Rust manifest. Regenerate lockfiles before committing:

```bash
pnpm install
cd src-tauri && cargo check && cd ..
pnpm lint
pnpm build
```

Desktop deep links are registered by installed application bundles. On Windows and Linux, the debug build also registers the configured scheme at runtime through Tauri's deep-link integration. Test the bundled application before release, especially on macOS.

## Scope

Authentication identifies the current user and gates the interface. Existing watchlist, progress, activity and preferences remain stored locally; this patch does not sync or partition local SQLite data by user. Add a remote sync layer or a per-user local database migration before promising cross-device accounts.
