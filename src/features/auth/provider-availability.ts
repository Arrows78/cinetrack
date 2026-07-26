import type { SocialAuthProvider } from "@/features/auth/auth-client";

const socialProviders: ReadonlyArray<{
  provider: SocialAuthProvider;
  settingsKeys: readonly string[];
}> = [
  { provider: "apple", settingsKeys: ["apple"] },
  { provider: "facebook", settingsKeys: ["facebook"] },
  { provider: "google", settingsKeys: ["google"] },
  { provider: "x", settingsKeys: ["x", "twitter"] },
];

interface SupabaseAuthSettings {
  external?: Record<string, unknown>;
}

function readSupabaseConfig(): { publishableKey: string; url: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) return null;

  return { publishableKey, url };
}

export async function getEnabledSocialProviders(signal?: AbortSignal): Promise<SocialAuthProvider[] | null> {
  const config = readSupabaseConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/auth/v1/settings`, {
    headers: {
      Accept: "application/json",
      apikey: config.publishableKey,
    },
    signal,
  });

  if (!response.ok) return null;

  const settings = (await response.json()) as SupabaseAuthSettings;
  const external = settings.external;

  if (!external || typeof external !== "object") return [];

  return socialProviders.filter(({ settingsKeys }) => settingsKeys.some((key) => external[key] === true)).map(({ provider }) => provider);
}
