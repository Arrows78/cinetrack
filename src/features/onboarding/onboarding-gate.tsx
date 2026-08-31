import { useEffect, useState, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useLibraryMediaKeys } from "@/features/library/use-library";
import { LoadingScreen } from "@/components/states/loading-screen";
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
 * Goal-oriented first-launch screen — sits in AuthRoot (auth-root.tsx)
 * rather than as a router route: the router's single root wraps every route
 * in AppShell's persistent sidebar, which a genuine first-launch screen
 * shouldn't show, the same reason AuthScreen/CreateProfileScreen are gates
 * rather than routes.
 */
type Disposition = "loading" | "onboarding" | "app";

export function OnboardingGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const preferencesQuery = usePreferences();
  const libraryKeysQuery = useLibraryMediaKeys();
  const onboardingCompleted = preferencesQuery.data?.onboardingCompleted ?? false;
  const hasExistingLibrary = (libraryKeysQuery.data?.length ?? 0) > 0;
  const { updatePreference } = preferencesQuery;
  const stillLoading = preferencesQuery.isLoading || libraryKeysQuery.isLoading;
  // Every other SQLite-backed page in the app degrades in place on a failed
  // read (see CLAUDE.md's browser-preview note) rather than blocking
  // rendering — this gate sits above AppShell for every route, so a full-page
  // error here would take the sidebar and the rest of the app down with it
  // just to answer a single yes/no onboarding question. Fall through instead;
  // whichever page actually needs the failed data still surfaces its own,
  // correctly-scoped error state.
  const failed = preferencesQuery.isError || libraryKeysQuery.isError;

  // Decided once and then frozen, not re-derived live on every render: a
  // query that's never succeeded (the case for every local.* read outside
  // the Tauri window) cycles back through TanStack Query's "pending" status
  // on every background refetch, not just its first attempt — and children
  // mounting below carry their own observers of these same query keys,
  // whose mount itself triggers exactly such a refetch. Re-deriving the
  // disposition live would catch that pending window — neither error nor
  // success — falls through to the "no data yet" defaults and flashes the
  // onboarding screen even for an established install, or unmounts children
  // and shows the loading screen again, which removes those observers and
  // lets the cycle repeat forever. Decide once from the first real settle
  // and stick with it; a later background refetch actually completing
  // doesn't need to change what's already on screen.
  //
  // setState called directly in the render body — not in a useEffect, so
  // the freeze lands in the same render pass instead of one tick later —
  // guarded by the state itself: once disposition leaves "loading" this
  // branch never runs again, so it's safe to check on every render rather
  // than needing to detect a transition (the settled result may already be
  // in on the very first render, with no prior "loading" render to
  // transition from).
  const [disposition, setDisposition] = useState<Disposition>("loading");
  if (disposition === "loading" && !stillLoading) {
    setDisposition(
      failed ? "app" : shouldShowOnboarding({ onboardingCompleted, hasExistingLibrary }) ? "onboarding" : "app"
    );
  }

  // Silently marks an established install "done" the first time it sees a
  // non-empty library with the flag still unset — see
  // shouldShowOnboarding's own doc comment.
  useEffect(() => {
    if (!preferencesQuery.isLoading && !onboardingCompleted && hasExistingLibrary) {
      void updatePreference({ key: "onboardingCompleted", value: true });
    }
  }, [preferencesQuery.isLoading, onboardingCompleted, hasExistingLibrary, updatePreference]);

  if (disposition === "loading") {
    return <LoadingScreen label={t("onboarding.loading")} />;
  }

  if (disposition === "onboarding") {
    return <OnboardingScreen />;
  }

  return children;
}
