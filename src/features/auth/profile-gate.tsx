import { useEffect, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { authConfig } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/use-auth";
import { CreateProfileScreen } from "@/features/auth/create-profile-screen";
import { cloudProfileRepository } from "@/features/auth/cloud-profile-repository";
import { useCreateProfileForSupabaseUser, useProfileForSupabaseUser } from "@/features/profiles/use-profiles";
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
  const createProfile = useCreateProfileForSupabaseUser();
  const cloudProfileQuery = useQuery({
    queryKey: ["remote", "accountProfile", supabaseUserId],
    queryFn: () => cloudProfileRepository.get(),
    enabled: profileQuery.isSuccess,
    staleTime: 60_000,
  });

  const resolvedProfileId = profileQuery.data?.id;
  const activeProfileId = preferencesQuery.data?.activeProfileId;

  useEffect(() => {
    if (!profileQuery.isSuccess || !cloudProfileQuery.isSuccess) return;

    // New device: reconstruct the local partition from the private account
    // profile before the sync coordinator pulls library/history data into it.
    if (!profileQuery.data && cloudProfileQuery.data && !createProfile.isSaving) {
      void createProfile.create({
        name: cloudProfileQuery.data.displayName,
        avatar: cloudProfileQuery.data.avatarPath,
        supabaseUserId,
      });
      return;
    }

    // Existing install upgrading into cloud sync: seed the private remote
    // identity once. This does not publish a community profile.
    if (profileQuery.data && cloudProfileQuery.data === null) {
      void cloudProfileRepository
        .save(profileQuery.data.name, profileQuery.data.avatar)
        .then(() => cloudProfileQuery.refetch());
    }
  }, [
    cloudProfileQuery.data,
    cloudProfileQuery.isSuccess,
    createProfile,
    profileQuery.data,
    profileQuery.isSuccess,
    supabaseUserId,
  ]);

  useEffect(() => {
    if (!resolvedProfileId || activeProfileId === resolvedProfileId) return;

    let cancelled = false;
    void preferencesRepository.setActiveProfile(resolvedProfileId, supabaseUserId).then(() => {
      // removeQueries, not invalidateQueries — this switches which local
      // profile is active, so the previous profile's cached library/
      // history/etc. must be evicted immediately rather than merely marked
      // stale (which would still render it until the refetch resolves).
      if (!cancelled) queryClient.removeQueries({ queryKey: ["local"] });
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedProfileId, activeProfileId, queryClient, supabaseUserId]);

  if (profileQuery.isLoading || preferencesQuery.isLoading || cloudProfileQuery.isLoading || createProfile.isSaving) {
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
  if (cloudProfileQuery.isError) {
    return <RemoteErrorState error={cloudProfileQuery.error} onRetry={() => void cloudProfileQuery.refetch()} />;
  }

  if (!profileQuery.data) {
    if (cloudProfileQuery.data) return <LoadingScreen label={t("profileGate.resolving")} />;
    return <CreateProfileScreen supabaseUserId={supabaseUserId} />;
  }

  if (activeProfileId !== resolvedProfileId) {
    // The preference write above is still in flight — avoid a one-tick
    // flash of the app against the previous profile's data.
    return <LoadingScreen label={t("profileGate.resolving")} />;
  }

  return children;
}
