// A dedicated public-surface export for GuidedTour, kept out of index.ts on
// purpose: index.ts also re-exports OnboardingGate, which pulls in
// onboarding-screen.tsx and, through it, the app router — dependencies
// GuidedTour itself doesn't need. Bundling them in one barrel would drag
// that whole chain into any caller that only wants the tour (see
// app-shell.tsx), which broke tests that mock the router only partially.
export { GuidedTour } from "@/features/onboarding/guided-tour";
