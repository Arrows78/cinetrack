import { useEffect, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { authConfig } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-context";
import { CreateProfileScreen } from "@/features/auth/create-profile-screen";
import { useProfileForSupabaseUser } from "@/features/collections/use-collections";
import { usePreferences } from "@/features/preferences/use-preferences";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { LoadingScreen } from "@/components/states/loading-screen";
import { RemoteErrorState } from "@/components/states/remote-error-state";

// Which local profile is active is derived from who is signed in, not
// picked freely — accessing a profile now requires being the Supabase
// account it's linked to. AuthGate already blocks everything here until a
// session exists whenever auth is required, so this only has real work to
// do in that case.
export function ProfileGate({ children }: PropsWithChildren) {
  const { session } = useAuth();

  if (!authConfig.required) return children;
  if (!session) return children;

  return <ResolvedProfileGate supabaseUserId={session.user.id}>{children}</ResolvedProfileGate>;
}

function ResolvedProfileGate({ supabaseUserId, children }: PropsWithChildren<{ supabaseUserId: string }>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileQuery = useProfileForSupabaseUser(supabaseUserId);
  const preferencesQuery = usePreferences();

  const resolvedProfileId = profileQuery.data?.id;
  const activeProfileId = preferencesQuery.data?.activeProfileId;

  useEffect(() => {
    if (!resolvedProfileId || activeProfileId === resolvedProfileId) return;

    let cancelled = false;
    void preferencesRepository.setActiveProfile(resolvedProfileId, supabaseUserId).then(() => {
      // removeQueries, not invalidateQueries — this switches which local
      // profile is active, so the previous profile's cached watchlist/
      // library/etc. must be evicted immediately rather than merely marked
      // stale (which would still render it until the refetch resolves).
      if (!cancelled) queryClient.removeQueries({ queryKey: ["local"] });
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedProfileId, activeProfileId, queryClient, supabaseUserId]);

  if (profileQuery.isLoading || preferencesQuery.isLoading) {
    return <LoadingScreen label={t("profileGate.resolving")} />;
  }

  // Without these, a failed read fell through to `!profileQuery.data` /
  // `activeProfileId === undefined` below — a profile lookup that failed
  // (network, local DB) looked identical to "this account has no profile
  // yet" and sent the user to profile creation, and a failed preferences
  // read left `activeProfileId` permanently undefined, stuck on the
  // resolving screen forever with no way out.
  if (profileQuery.isError) {
    return <RemoteErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />;
  }
  if (preferencesQuery.isError) {
    return <RemoteErrorState error={preferencesQuery.error} onRetry={() => void preferencesQuery.refetch()} />;
  }

  if (!profileQuery.data) {
    return <CreateProfileScreen supabaseUserId={supabaseUserId} />;
  }

  if (activeProfileId !== resolvedProfileId) {
    // The preference write above is still in flight — avoid a one-tick
    // flash of the app against the previous profile's data.
    return <LoadingScreen label={t("profileGate.resolving")} />;
  }

  return children;
}
