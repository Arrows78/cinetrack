import type { SupabaseClient } from "@supabase/supabase-js";

import { getClerkInstance } from "@/shared/lib/clerk-instance";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const dataClientConfig = {
  // Postgres/Realtime only now — identity moved to Clerk. See docs/auth.md's
  // Clerk migration section: this project's Supabase project keeps
  // sync_*/community_*/account_profiles and their RLS policies, but no
  // longer runs Supabase Auth at all.
  configured: Boolean(supabaseUrl && supabasePublishableKey),
};

let clientPromise: Promise<SupabaseClient | null> | null = null;

// Third-Party Auth (see the Clerk+Supabase integration activated in both
// dashboards, docs/auth.md): the `accessToken` option replaces Supabase's
// own `auth` module entirely — passing it means `client.auth.getSession()`/
// `getUser()` are unusable (there is no local Supabase Auth session to
// read), which is why every caller of this client reads the current user's
// id from Clerk (getCurrentUserId() below), never from `client.auth`.
// `session.getToken()` is called with no `{ template }` argument: Clerk's
// native Supabase integration (activated in the Clerk Dashboard) already
// stamps the session token's `role` claim as `authenticated` and Supabase
// reads the `sub` claim directly via `requesting_user_id()` — the old
// JWT-template method was deprecated April 2025 and needed here.
function accessToken(): Promise<string | null> {
  const clerk = getClerkInstance();
  const session = clerk?.session;

  if (!session) return Promise.resolve(null);

  return session.getToken();
}

// Dynamically imported for the same reason getAuthClient() used to be
// (see auth-client.ts's git history): a build with sync/community
// unconfigured should never have to fetch @supabase/supabase-js at all.
export function getDataClient(): Promise<SupabaseClient | null> {
  if (!dataClientConfig.configured || !supabaseUrl || !supabasePublishableKey) {
    return Promise.resolve(null);
  }

  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(supabaseUrl, supabasePublishableKey, { accessToken })
  );

  return clientPromise;
}

/** The Clerk `sub` — the same value every rewritten RLS policy compares against via `requesting_user_id()`. */
export function getCurrentUserId(): string | null {
  return getClerkInstance()?.user?.id ?? null;
}
