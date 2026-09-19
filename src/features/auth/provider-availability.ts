import { getClerkInstance } from "@/features/auth/auth-client";
import type { SocialAuthProvider } from "@/features/auth/auth-client";

const socialProviders: ReadonlyArray<{ provider: SocialAuthProvider; strategyKey: string }> = [
  { provider: "apple", strategyKey: "oauth_apple" },
  { provider: "facebook", strategyKey: "oauth_facebook" },
  { provider: "google", strategyKey: "oauth_google" },
  { provider: "x", strategyKey: "oauth_x" },
];

interface ClerkEnvironmentResponse {
  user_settings?: {
    social?: Record<string, { enabled?: boolean }>;
  };
}

// Clerk's Frontend API exposes its public environment (including which
// social connections are enabled) at GET /v1/environment — no API key
// required, same "read the provider's own public settings" pattern the
// former Supabase Auth /auth/v1/settings call used. Reused as `fetch(...)`
// (not the Tauri http-plugin fetch directly) because auth-client.ts's
// bootstrapClerkInstance() already patches window.fetch for this exact
// host before this ever runs (see its doc comment) — this call is only
// ever made after that patch is in place, since AuthScreen mounts only
// once AuthGate has already decided auth is configured and required.
export async function getEnabledSocialProviders(signal?: AbortSignal): Promise<SocialAuthProvider[] | null> {
  const clerk = getClerkInstance();

  if (!clerk) return null;

  const response = await fetch(`https://${clerk.frontendApi}/v1/environment`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) return null;

  const environment = (await response.json()) as ClerkEnvironmentResponse;
  const social = environment.user_settings?.social;

  if (!social || typeof social !== "object") return [];

  return socialProviders
    .filter(({ strategyKey }) => social[strategyKey]?.enabled === true)
    .map(({ provider }) => provider);
}
