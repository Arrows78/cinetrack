// Captured at module-evaluation time. main.tsx imports this module first,
// before React/fonts/i18n/anything else, so this is as close to "the app
// started loading" as JS execution allows — used to log a `startup.total`
// line once the app is actually showing real content (see App.tsx).
export const appBootStartedAt = performance.now();
