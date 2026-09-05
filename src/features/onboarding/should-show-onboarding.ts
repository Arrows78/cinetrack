/**
 * An existing install upgrading into the `onboardingCompleted` preference
 * for the first time has a non-empty library, not an unset flag — treated
 * the same as "already done" so onboarding never resurfaces for an
 * established user just because this key happened to never be written for
 * them.
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
