import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { authConfig } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/use-auth";
import { CreateProfileScreen } from "@/features/auth/create-profile-screen";
import { cloudProfileRepository } from "@/features/auth/cloud-profile-repository";
import { useCreateProfileForSupabaseUser, useProfileForSupabaseUser } from "@/features/profiles/use-profiles";
import { usePreferences } from "@/features/preferences/use-preferences";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { profileRepository } from "@/features/profiles/profile-repository";
import { PinPromptDialog } from "@/components/settings/pin-prompt-dialog";
import { LoadingScreen } from "@/components/states/loading-screen";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { errorMessage } from "@/shared/lib/errors";
import { ApiCommandError } from "@/shared/lib/invoke";
import { logger } from "@/shared/lib/logger";

// Which local profile is active is derived from who is signed in, not
// picked freely — accessing a profile now requires being the account it's
// linked to. AuthGate already blocks everything here until a session
// exists whenever auth is required, so this only has real work to do in
// that case.
//
// `session.user.id` is Clerk's user id (a "user_xxx" string, the JWT `sub`
// claim) — the prop/param below is still named `supabaseUserId` throughout
// this feature and `profiles.supabase_user_id` in SQLite keeps its name
// too (see profiles/models.rs and preferences/service.rs in src-tauri):
// both predate Clerk and were deliberately left as-is rather than renamed,
// since it's a bare correlation string agnostic of which identity
// provider issued it — see docs/auth.md's Clerk migration section.
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
  const refetchCloudProfile = cloudProfileQuery.refetch;
  const createLocalProfile = createProfile.create;
  const isCreatingProfile = createProfile.isSaving;

  const resolvedProfileId = profileQuery.data?.id;
  const activeProfileId = preferencesQuery.data?.activeProfileId;

  // A failed step is shown (with a retry) rather than retried by the effects
  // below on every render, or left on the loading screen forever. The refs
  // make each step run once per attempt; the retry buttons reset them.
  const [creationError, setCreationError] = useState<unknown>(null);
  const [switchError, setSwitchError] = useState<unknown>(null);
  const [switchAttempt, setSwitchAttempt] = useState(0);
  const evictLocalQueries = () => queryClient.removeQueries({ queryKey: ["local"] });
  // A PIN-protected profile is never entered on the strength of the account
  // alone: the switch is refused (403) until the PIN is entered here.
  const [pinRequired, setPinRequired] = useState(false);
  const creationStarted = useRef(false);
  const cloudSeedStarted = useRef(false);

  useEffect(() => {
    if (!profileQuery.isSuccess || !cloudProfileQuery.isSuccess) return;

    // New device: reconstruct the local partition from the private account
    // profile before the sync coordinator pulls library/history data into it.
    if (!profileQuery.data && cloudProfileQuery.data) {
      if (isCreatingProfile || creationStarted.current) return;
      creationStarted.current = true;
      createLocalProfile({
        name: cloudProfileQuery.data.displayName,
        avatar: cloudProfileQuery.data.avatarPath,
        supabaseUserId,
      }).catch((error: unknown) => {
        logger.warn(`Couldn't recreate the local profile from the account profile: ${errorMessage(error)}`);
        setCreationError(error);
      });
      return;
    }

    /// Existing install upgrading into cloud sync: seed the private remote
    // identity once. This does not publish a community profile.
    if (profileQuery.data?.name && cloudProfileQuery.data === null && !cloudSeedStarted.current) {
      cloudSeedStarted.current = true;
      cloudProfileRepository
        .save(profileQuery.data.name, profileQuery.data.avatar)
        .then(() => refetchCloudProfile())
        .catch((error: unknown) =>
          logger.warn(`Couldn't seed the cloud account profile, continuing locally: ${errorMessage(error)}`)
        );
    }
  }, [
    cloudProfileQuery.data,
    cloudProfileQuery.isSuccess,
    createLocalProfile,
    creationError,
    isCreatingProfile,
    refetchCloudProfile,
    profileQuery.data,
    profileQuery.isSuccess,
    supabaseUserId,
  ]);

  const cloudProfileError = cloudProfileQuery.error;
  useEffect(() => {
    if (cloudProfileError)
      logger.warn(`Cloud account profile unavailable, continuing locally: ${errorMessage(cloudProfileError)}`);
  }, [cloudProfileError]);

  useEffect(() => {
    if (!resolvedProfileId || activeProfileId === resolvedProfileId) return;

    let cancelled = false;
    preferencesRepository
      .setActiveProfile(resolvedProfileId, supabaseUserId)
      .then(() => {
        // removeQueries, not invalidateQueries — this switches which local
        // profile is active, so the previous profile's cached library/
        // history/etc. must be evicted immediately rather than merely marked
        // stale (which would still render it until the refetch resolves).
        if (!cancelled) queryClient.removeQueries({ queryKey: ["local"] });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiCommandError && error.status === 403) {
          if (!cancelled) setPinRequired(true);
          return;
        }
        logger.warn(`Couldn't switch to the account's profile: ${errorMessage(error)}`);
        if (!cancelled) setSwitchError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedProfileId, activeProfileId, queryClient, supabaseUserId, switchAttempt]);

  if (profileQuery.isLoading || preferencesQuery.isLoading || cloudProfileQuery.isLoading || isCreatingProfile) {
    return <LoadingScreen label={t("profileGate.resolving")} />;
  }

  if (creationError) {
    return (
      <RemoteErrorState
        error={creationError}
        description={t("profileGate.createError")}
        onRetry={() => {
          creationStarted.current = false;
          setCreationError(null);
        }}
      />
    );
  }
  if (switchError) {
    return (
      <RemoteErrorState
        error={switchError}
        description={t("profileGate.switchError")}
        onRetry={() => {
          setSwitchError(null);
          setSwitchAttempt((attempt) => attempt + 1);
        }}
      />
    );
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
  // The cloud account profile is a convergence layer on top of local data,
  // not a prerequisite: when this device already has a local profile, an
  // unreachable cloud (paused project, offline, DNS) must not lock the user
  // out of their own library — it's logged and the app carries on locally.
  // Only a device with no local profile yet genuinely needs the cloud read,
  // to tell "new device" from "new account".
  if (cloudProfileQuery.isError && !profileQuery.data) {
    return (
      <RemoteErrorState
        error={cloudProfileQuery.error}
        description={t("profileGate.cloudUnavailable")}
        onRetry={() => void cloudProfileQuery.refetch()}
      />
    );
  }

  if (!profileQuery.data) {
    if (cloudProfileQuery.data) return <LoadingScreen label={t("profileGate.resolving")} />;
    return <CreateProfileScreen supabaseUserId={supabaseUserId} />;
  }

  if (activeProfileId !== resolvedProfileId && pinRequired) {
    return (
      <PinPromptDialog
        open
        profileName={profileQuery.data.name ?? ""}
        onOpenChange={() => undefined}
        onVerify={(pin) => profileRepository.verifyPin(resolvedProfileId!, pin)}
        onSuccess={(pin) => {
          preferencesRepository
            .setActiveProfile(resolvedProfileId!, supabaseUserId, pin)
            .then(() => {
              setPinRequired(false);
              evictLocalQueries();
            })
            .catch((error: unknown) => {
              logger.warn(`Couldn't switch to the account's profile: ${errorMessage(error)}`);
              setPinRequired(false);
              setSwitchError(error);
            });
        }}
      />
    );
  }

  if (activeProfileId !== resolvedProfileId) {
    // The preference write above is still in flight — avoid a one-tick
    // flash of the app against the previous profile's data.
    return <LoadingScreen label={t("profileGate.resolving")} />;
  }

  return children;
}
