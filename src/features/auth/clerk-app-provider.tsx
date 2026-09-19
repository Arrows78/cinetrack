import type { PropsWithChildren } from "react";
import { ClerkProvider } from "@clerk/react";

import { authConfig, getClerkInstance } from "@/features/auth/auth-client";
import { isTauriApp } from "@/shared/lib/platform";

// Thin wrapper around @clerk/react's <ClerkProvider>, isolating two
// Tauri-specific choices from the rest of the auth feature:
//
// 1. `Clerk={getClerkInstance()}` passes the already-constructed,
//    bundled clerk-js instance from auth-client.ts's bootstrapClerkInstance()
//    (awaited in main.tsx before the app's first render) instead of letting
//    @clerk/react construct and hot-load its own from Clerk's CDN.
// 2. `standardBrowser={false}` inside Tauri: clerk-js's default assumption —
//    that cookies can be set and read back reliably — doesn't hold in
//    WKWebView/WebView2 (see clerk-instance.ts's patchFetchForFrontendApi
//    comment). Outside Tauri (the browser-preview `pnpm dev` surface),
//    normal browser-cookie behavior is fine, so this only flips for real
//    desktop/mobile builds.
//
// `__internal_bypassMissingPublishableKey` keeps CineTrack's account-free,
// local-only mode working: when Clerk isn't configured at all (no
// VITE_CLERK_PUBLISHABLE_KEY), every hook below this provider (useSignIn,
// useSession, ...) just reports "not loaded" forever instead of throwing —
// AuthProvider already gates every real action on authConfig.configured,
// exactly like it did for a missing Supabase config before this migration.
export function ClerkAppProvider({ children }: PropsWithChildren) {
  const nativeWebview = isTauriApp();

  return (
    <ClerkProvider
      Clerk={getClerkInstance() ?? undefined}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || ""}
      __internal_bypassMissingPublishableKey={!authConfig.configured}
      standardBrowser={!nativeWebview}
      {...(nativeWebview ? { experimental: { runtimeEnvironment: "headless" } } : {})}
    >
      {children}
    </ClerkProvider>
  );
}
