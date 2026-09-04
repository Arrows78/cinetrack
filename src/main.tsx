// Imported first, before anything else in this file, so its module-level
// timestamp is as close as possible to "the app started loading" — see
// startup-timing.ts's own doc comment.
import "@/shared/lib/startup-timing";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/app/App";
import { BootRecoveryGate } from "@/components/desktop/boot-recovery-gate";
import { AuthRoot } from "@/features/auth/auth-root";
import { RootErrorBoundary } from "@/components/layout/root-error-boundary";
import { queryClient } from "@/app/query-client";
import { i18nReady } from "@/i18n";
// Self-hosted fonts (see src/styles/index.css's comment for why these are
// imported here rather than via a CSS @import) — offline, no third-party
// CDN, and no CSP allowance needed for fonts.googleapis.com/fontshare.com.
import "@fontsource-variable/dm-sans/opsz.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/900.css";
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource/syne/400.css";
import "@fontsource/syne/500.css";
import "@fontsource/syne/600.css";
import "@fontsource/syne/700.css";
import "@fontsource/syne/800.css";
import "@/styles/index.css";

// One-time cleanup for installs upgrading from a version that persisted
// local.* query data (library/history/notes/preferences) to
// localStorage — removing the persister going forward doesn't erase what
// it already wrote. Safe to call unconditionally: a no-op once the key is
// gone.
window.localStorage.removeItem("cinetrack.query-cache.v1");

// Waits for the active language's locale chunk (see i18n/index.ts's
// dynamically-imported backend) so first paint never briefly shows raw
// translation keys instead of real copy.
void i18nReady.then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BootRecoveryGate>
            <AuthRoot>
              <App />
            </AuthRoot>
          </BootRecoveryGate>
        </QueryClientProvider>
      </RootErrorBoundary>
    </React.StrictMode>
  );
});
