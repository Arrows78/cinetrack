# Supabase Auth Configuration for CineTrack

This guide covers the authentication methods available on the `feat/authentication-methods` branch:

- One-time code sent by email
- Google
- Apple
- Facebook
- X (OAuth 2.0)
- Web callback and Tauri desktop callback through a deep link

## 1. Local variables

Copy `.env.example` to `.env`, then set:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_AUTH_REQUIRED=true
VITE_AUTH_DESKTOP_REDIRECT_URL=cinetrack://auth/callback
VITE_AUTH_WEB_REDIRECT_URL=http://localhost:1420/
VITE_AUTH_OTP_LENGTH=6
VITE_AUTH_OTP_RESEND_SECONDS=60
```

Only use the public `publishable` key. Never place a `secret` or `service_role` key in a Vite variable because it would be included in the distributed application.

## 2. URL Configuration

In Supabase, open **Authentication > URL Configuration**.

For development:

- **Site URL**: `http://localhost:1420/`
- **Redirect URLs**:
  - `http://localhost:1420/`
  - `cinetrack://auth/callback`

Also add the exact HTTPS URL of the production site if a web version is published.

The `redirectTo` sent by the application must match an allowed entry. Avoid wildcards in production when an exact URL is sufficient.

## 3. Email code authentication

In **Authentication > Sign In / Providers > Email**:

1. Enable the Email provider.
2. Keep the code length consistent with `VITE_AUTH_OTP_LENGTH`.
3. Configure the code expiration.
4. Keep the sending interval consistent with `VITE_AUTH_OTP_RESEND_SECONDS`; Supabase uses 60 seconds by default.

In **Authentication > Email Templates > Magic Link**, replace the magic link with a code:

```html
<h2>Your CineTrack code</h2>
<p>Enter this code in the application: <strong>{{ .Token }}</strong></p>
```

Supabase uses the same mechanism for Magic Link and Email OTP. Without `{{ .Token }}`, the CineTrack interface will expect a code that never appears in the email.

**Sign in** now sends `shouldCreateUser: false`. **Sign up** sends `shouldCreateUser: true`. This prevents a sign-in attempt from silently creating an account.

For production, configure custom SMTP in **Authentication > SMTP Settings** to control deliverability and sending limits.

## 4. OAuth providers

All external providers use this provider-side callback:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

This URL differs from the `cinetrack://auth/callback` deep link:

1. The OAuth provider returns to Supabase.
2. Supabase then redirects to the allowed CineTrack `redirectTo`.

### Google

In Google Cloud Console:

1. Create and configure the OAuth consent screen.
2. Create an OAuth client of type **Web application**.
3. Add the Supabase URL above to **Authorized redirect URIs**.
4. Copy the Client ID and Client Secret to **Supabase > Authentication > Sign In / Providers > Google**.

### Facebook

In Meta for Developers:

1. Create an application and add Facebook Login.
2. Add the Supabase callback URL to **Valid OAuth Redirect URIs**.
3. Allow access to the email address, which the standard Supabase flow requires.
4. Copy the App ID and App Secret to the Facebook provider in Supabase.

### Apple

For the web flow opened by Tauri:

1. Create and configure a Services ID for Sign in with Apple.
2. Declare the Supabase domain and Supabase callback URL.
3. Create the Apple key and retrieve the Team ID, Key ID, and private key.
4. Generate and configure the secret required by Supabase.
5. Plan for Apple secret rotation when it applies to your web configuration.

Apple only provides the full name during the first authorization and does not always include it in later tokens. Do not rely on `full_name` to identify an account.

### X

Use the **X / Twitter OAuth 2.0** provider, not the legacy OAuth 1.0a provider:

1. Create a project and application in the X Developer Portal.
2. Select a Web application.
3. Enable the email address request if needed.
4. Add the Supabase callback URL.
5. Copy the Client ID and Client Secret to the **X / Twitter OAuth 2.0** provider in Supabase.

The current Supabase SDK expects the provider value `x`, so the UI layer also uses `x`.

## 5. Tauri and deep links

The repository already contains:

- The `cinetrack` desktop scheme in `tauri.conf.json`
- `tauri-plugin-deep-link`
- `tauri-plugin-single-instance` with the `deep-link` feature
- The runtime registration required for development on Windows and Linux

The single-instance plugin must remain the first registered plugin. The modified file also brings the main window to the foreground when the browser completes an OAuth flow.

The callback protocol, host, and path are validated before the PKCE exchange:

```text
cinetrack://auth/callback
```

Test deep links with an installed or bundled application, especially on macOS where protocol association depends on the bundle.

## 6. Supabase security

- Never use `service_role` in the frontend.
- Users can modify `user_metadata` fields, including `marketing_opt_in`; do not use them for authorization.
- Enable RLS on every remote table that contains user data.
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

## 7. Test flow

1. Run `pnpm dev` and test the email code in Sign up mode.
2. Sign out, then test the same email in Sign in mode.
3. Test an unknown email in Sign in mode; no account should be created.
4. Verify that the resend button remains disabled for the configured delay.
5. Test each enabled provider in the browser.
6. Run `pnpm tauri dev`, start an OAuth flow, and verify the return to CineTrack.
7. Test with CineTrack already open, minimized, and closed.
