import { useEffect, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useLibraryMediaKeys } from "@/features/library/use-library";
import { LoadingScreen } from "@/components/states/loading-screen";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

/**
 * Exported for isolated unit testing — the actual decision behind
 * OnboardingGate. An existing install upgrading into the
 * `onboardingCompleted` preference for the first time has a non-empty
 * library, not an unset flag — treated the same as "already done" so
 * onboarding never resurfaces for an established user just because this
 * key happened to never be written for them.
 */
export function shouldShowOnboarding({
  onboardingCompleted,
  hasExistingLibrary,
}: {
  onboardingCompleted: boolean;
  hasExistingLibrary: boolean;
}): boolean {
  return !onboardingCompleted && !hasExistingLibrary;
}

/**
 * Goal-oriented first-launch screen — see docs/architecture.md's
 * "Architecture boundaries" for why this sits in AuthRoot (auth-root.tsx)
 * rather than as a router route: the router's single root wraps every route
 * in AppShell's persistent sidebar, which a genuine first-launch screen
 * shouldn't show, the same reason AuthScreen/CreateProfileScreen are gates
 * rather than routes.
 */
export function OnboardingGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const preferencesQuery = usePreferences();
  const libraryKeysQuery = useLibraryMediaKeys();
  const onboardingCompleted = preferencesQuery.data?.onboardingCompleted ?? false;
  const hasExistingLibrary = (libraryKeysQuery.data?.length ?? 0) > 0;
  const { updatePreference } = preferencesQuery;

  // Silently marks an established install "done" the first time it sees a
  // non-empty library with the flag still unset — see
  // shouldShowOnboarding's own doc comment.
  useEffect(() => {
    if (!preferencesQuery.isLoading && !onboardingCompleted && hasExistingLibrary) {
      void updatePreference({ key: "onboardingCompleted", value: true });
    }
  }, [preferencesQuery.isLoading, onboardingCompleted, hasExistingLibrary, updatePreference]);

  if (preferencesQuery.isLoading || libraryKeysQuery.isLoading) {
    return <LoadingScreen label={t("onboarding.loading")} />;
  }
  if (preferencesQuery.isError) {
    return <RemoteErrorState error={preferencesQuery.error} onRetry={() => void preferencesQuery.refetch()} />;
  }
  if (libraryKeysQuery.isError) {
    return <RemoteErrorState error={libraryKeysQuery.error} onRetry={() => void libraryKeysQuery.refetch()} />;
  }

  if (!shouldShowOnboarding({ onboardingCompleted, hasExistingLibrary })) return children;

  return <OnboardingScreen />;
}
